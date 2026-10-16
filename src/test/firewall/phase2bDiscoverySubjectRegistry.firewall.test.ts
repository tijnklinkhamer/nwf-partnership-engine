/**
 * TRACK B, B2.2 - THE ISOLATION TEST FOR THE CONTROLLED DISCOVERY-SUBJECT
 * REGISTRY.
 *
 * Per the phase-isolation convention this change is pinned by its OWN
 * repair-scope file over its OWN commit range; the only earlier test files it
 * edits are named below with their exact removed lines. It proves, from the
 * real git range and the real source:
 *
 *   - the change set is EXACTLY the authorised files, by path and status;
 *   - B1.1 (frontier, fetch policy v8, budgets), B3.0 (the research cohort
 *     guard and the discover CLI), B2.1 (the identity module and migration
 *     0013), the classifier, the gateway, robots, signals, ingestion, every
 *     earlier migration and every evaluation harness are unchanged;
 *   - the registry opens no socket, reads no environment (beyond the
 *     reviewer seam's vitest guard), calls no model, starts no research,
 *     scores nothing and declares no contact-shaped property;
 *   - its SQL is a closed set: SELECTs, and INSERTs into exactly the four
 *     discovery tables, from exactly one file; nothing updates, deletes,
 *     truncates or alters anything;
 *   - review authority cannot be supplied as a string: no command accepts an
 *     actor key, the reviewer capability has no production constructor, and
 *     the CLI refuses review execution;
 *   - migration 0014 creates one NOLOGIN capability role and grants it
 *     exactly the declared privileges, and gives no existing role anything;
 *   - (B2.2-C) the registry is NOT a canonical identity issuer: it mints only
 *     B-local v4 UUIDs, builds no `cand:` / `chn:` / `opp:` identifier,
 *     exports no merge, split, link, equivalence or handoff operation, and its
 *     vocabularies carry no SAME_ACTOR-shaped predicate or outcome. Track C
 *     owns canonical Candidate and Channel identity (ADR 0020 s12).
 * Guarantees that cannot be proven statically (privilege refusals, atomicity,
 * stale and concurrent reviews, network silence) are proven behaviourally by
 * src/test/integration/discoverySubjectRegistry.test.ts.
 *
 * THE RANGE IS REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT. It is open to the
 * working tree while the change is uncommitted, and must be pinned to the
 * implementation commit in a separately authorised commit-closure phase.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EVALUATION_COHORT_ARTIFACT_PINS,
  loadEvaluationCohortRegistry,
} from '../../orgunits/classify/evaluationCohortGuard.js';
import { DISCOVERY_SUBJECTS_OPTIONS } from '../../cli/commands/discoverySubjects.js';
import {
  IDENTIFIER_SHAPES,
  IDENTITY_CLAIM_KINDS,
  RELATIONSHIP_PREDICATES,
  REVIEW_OUTCOMES,
  SOURCE_TYPES,
  SUBJECT_KINDS,
} from '../../orgunits/identity/vocabulary.js';
import * as registryReadModel from '../../orgunits/subjectRegistry/readModel.js';
import * as registryRequests from '../../orgunits/subjectRegistry/requests.js';
import * as registryReviewAuthority from '../../orgunits/subjectRegistry/reviewAuthority.js';
import * as registryStore from '../../orgunits/subjectRegistry/store.js';
import * as registryWriter from '../../orgunits/subjectRegistry/writer.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B2.1 tip (discovery-subject identity, firewall pinned). */
const REPAIR_BASE_COMMIT = '6a1a70099d16b7f05b3935b867e0a203610bcece';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = '4189d1e0c160b6d1f89a61b89c5fc20477897d39';

const MIGRATION = 'migrations/0014_discovery_subject_writer.sql';
const REGISTRY_DIR = 'src/orgunits/subjectRegistry/';
const REGISTRY_FILES = [
  'src/orgunits/subjectRegistry/readModel.ts',
  'src/orgunits/subjectRegistry/requests.ts',
  'src/orgunits/subjectRegistry/reviewAuthority.ts',
  'src/orgunits/subjectRegistry/store.ts',
  'src/orgunits/subjectRegistry/writer.ts',
];
const CLI_COMMAND = 'src/cli/commands/discoverySubjects.ts';
const CLI_ENTRY = 'src/cli/index.ts';
const ENV = 'src/config/env.ts';
const B21_FIREWALL = 'src/test/firewall/phase2bDiscoverySubjectIdentity.firewall.test.ts';
const B21_SCHEMA_TEST = 'src/test/integration/discoveryIdentitySchema.test.ts';
const SCHEMA_INVENTORY = 'src/test/integration/orgunitSchema.test.ts';
const A1_FRAME_TEST = 'src/test/unit/orgunitCorpus2DA1Frame.test.ts';
const TABLES = [
  'discovery_subjects',
  'discovery_subject_identity_claims',
  'discovery_subject_relationship_claims',
  'discovery_subject_reviews',
];

/**
 * B2.4-R1a (TL-authorised exact-path exception, 2026-10-16): the ONLY current
 * production files outside the registry that may name it - the pure
 * subject-evidence projection - and the ONLY registry modules they may import:
 * the pure read model, the request vocabulary and the attestation read types.
 * Never the writer, the store, the reviewer authority or the evidence binding.
 */
const B24_READ_MODEL_IMPORTERS = [
  'src/orgunits/subjectHandoff/findings.ts',
  'src/orgunits/subjectHandoff/project.ts',
];
const B24_READ_MODEL_IMPORT =
  /from '\.\.\/subjectRegistry\/(?:readModel|requests|reviewAttestation)\.js'/g;

/** The exact authorised change set, as `git diff --name-status` lines. */
const AUTHORISED_CHANGESET = [
  'A\tdocs/adr/0020-controlled-discovery-subject-registry.md',
  'A\tdocs/evaluation/TRACK_B_B2_2_DISCOVERY_SUBJECT_REGISTRY_OWNER_DECISION_V1.json',
  `A\t${MIGRATION}`,
  `A\t${CLI_COMMAND}`,
  `M\t${CLI_ENTRY}`,
  `M\t${ENV}`,
  ...REGISTRY_FILES.map((f) => `A\t${f}`),
  'A\tsrc/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts',
  `M\t${B21_FIREWALL}`,
  `M\t${B21_SCHEMA_TEST}`,
  'A\tsrc/test/integration/discoverySubjectRegistry.test.ts',
  `M\t${SCHEMA_INVENTORY}`,
  'A\tsrc/test/unit/discoverySubjectRegistryB22.test.ts',
  `M\t${A1_FRAME_TEST}`,
].sort();

/** Paths this change may not touch at all. */
const FORBIDDEN_PATHS = [
  'src/orgunits/identity/',
  'src/orgunits/classify/',
  'src/orgunits/web/',
  'src/orgunits/signals/',
  'src/orgunits/orchestrator/',
  'src/orgunits/sitemap.ts',
  'src/cli/commands/classify.ts',
  'src/cli/commands/classifyProvider.ts',
  'src/cli/commands/classifyRead.ts',
  'src/cli/commands/discover.ts',
  'src/cli/commands/ewp.ts',
  'src/cli/commands/ingestEche.ts',
  'src/cli/commands/ingestRuns.ts',
  'src/cli/commands/orgs.ts',
  'src/cli/commands/website.ts',
  'src/ingest/',
  'src/website/',
  'src/compare/',
  'src/db/',
  'src/logging/',
  'src/test/harness/',
  'src/test/helpers/',
  'src/test/integration/helpers.ts',
  'src/test/integration/cohortTestRegistry.ts',
  'docs/evaluation/corpus/',
  'scripts/',
  'docker/',
  'docker-compose.yml',
  '.env.example',
  'package.json',
  'package-lock.json',
  'CLAUDE.md',
];

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
function changeset(...paths: readonly string[]): string[] {
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

/**
 * Pinned-commit sources, keyed by the exact `commit:path` object name, so one
 * `git show` per file per process. A commit's blob cannot change, so an entry
 * never goes stale; a failed read throws and is never cached.
 */
const pinnedSources = new Map<string, string>();

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  const object = `${REPAIR_TERMINAL_COMMIT}:${path}`;
  let source = pinnedSources.get(object);
  if (source === undefined) {
    source = execFileSync('git', ['-C', REPO_ROOT, 'show', object], { encoding: 'utf8' });
    pinnedSources.set(object, source);
  }
  return source;
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sqlCodeOf(source: string): string {
  return source.replace(/--.*$/gm, '');
}

/**
 * Every production TypeScript file (non-test) under `src/` AS B2.2 LEFT IT: at
 * the terminal commit once pinned, the working tree until then. Used for the
 * claims that describe this slice (which files it wired), so a later,
 * separately authorised slice never has to re-scope them (ADR 0019 s10.3).
 */
function productionFilesOfThisSlice(): string[] {
  if (REPAIR_TERMINAL_COMMIT === null) return productionFiles();
  return execFileSync(
    'git',
    ['-C', REPO_ROOT, 'ls-tree', '-r', '--name-only', REPAIR_TERMINAL_COMMIT, '--', 'src'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => f.endsWith('.ts') && !f.startsWith('src/test/'))
    .sort();
}

/**
 * Every production TypeScript file (non-test) under `src/`, in the working
 * tree. Used for the standing security invariants (no forged reviewer, no
 * research path reading the registry), which every later slice must keep.
 */
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

const describeRange = rangeAvailable ? describe : describe.skip;

describeRange(
  'B2.2 discovery-subject registry: the change stays inside its authorised scope',
  () => {
    it('changes exactly the authorised files, by path and status', () => {
      expect(changeset()).toEqual(AUTHORISED_CHANGESET);
    });

    it('touches no identity, research, classifier, gateway, signal, ingestion, harness, dependency or cohort path', () => {
      expect(changeset(...FORBIDDEN_PATHS)).toEqual([]);
    });

    it('adds exactly one migration and edits no earlier one', () => {
      expect(changeset('migrations/')).toEqual([`A\t${MIGRATION}`]);
    });

    it('adds exactly one firewall, and edits only the B2.1 firewall', () => {
      expect(changeset('src/test/firewall/')).toEqual([
        'A\tsrc/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts',
        `M\t${B21_FIREWALL}`,
      ]);
    });

    it('leaves the classifier cohort guard pins untouched, and they still verify', () => {
      for (const pin of EVALUATION_COHORT_ARTIFACT_PINS) {
        expect(changeset(pin.path), pin.path).toEqual([]);
      }
      expect(loadEvaluationCohortRegistry().ok).toBe(true);
    });

    it('leaves fetch policy v8 and every frozen budget exactly as B1.1 left them', () => {
      expect(readFileSync(join(REPO_ROOT, 'src/orgunits/web/policy.ts'), 'utf8')).toContain(
        "export const FETCH_POLICY_VERSION = 'orgunit-fetch-policy-v8';",
      );
      const constants = readFileSync(
        join(REPO_ROOT, 'src/orgunits/orchestrator/constants.ts'),
        'utf8',
      );
      for (const line of [
        'export const MAX_PAGE_ATTEMPTS_PER_ROOT = 35;',
        'export const MAX_TOTAL_REQUESTS_PER_ROOT = 60;',
        'export const MAX_HOSTS_PER_ROOT = 8;',
        'export const TRACK_B_FLOOR = 8;',
      ]) {
        expect(constants).toContain(line);
      }
    });

    it('extends the CLI entry point only by an early, isolated dispatch', () => {
      const { removed, added } = diffLines(CLI_ENTRY);
      expect(removed).toEqual([]);
      expect(added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
        "import { runDiscoverySubjects } from './commands/discoverySubjects.js';",
        '  nwf-pe discovery-subjects propose|claim|relate|review|show|list ...',
        '                              (run \\`nwf-pe discovery-subjects --help\\` for its own options)',
        "  if (argv[0] === 'discovery-subjects') {",
        '    return runDiscoverySubjects(argv.slice(1));',
        '  }',
      ]);
    });

    it('extends the environment only by the writer connection variables', () => {
      const { removed, added } = diffLines(ENV);
      expect(removed).toEqual([
        "export type Role = 'admin' | 'ingest' | 'readonly' | 'research' | 'classifier';",
      ]);
      expect(added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
        '  DATABASE_URL_DISCOVERY_SUBJECT_WRITER: z.string().min(1).optional(),',
        '  DATABASE_URL_DISCOVERY_SUBJECT_WRITER_TEST: z.string().min(1).optional(),',
        'export type Role =',
        "  'admin' | 'ingest' | 'readonly' | 'research' | 'classifier' | 'discovery_subject_writer';",
        "  discovery_subject_writer: 'DATABASE_URL_DISCOVERY_SUBJECT_WRITER',",
        "  discovery_subject_writer: 'DATABASE_URL_DISCOVERY_SUBJECT_WRITER_TEST',",
      ]);
    });

    it('acknowledges 0014 in the historical tests exactly as each prescribes, and changes nothing else there', () => {
      // Schema inventory: the pinned list, by its own comment's pattern.
      const inventory = diffLines(SCHEMA_INVENTORY);
      expect(inventory.removed).toEqual([
        "    it('records versions 0001 through 0013 with no gaps', async () => {",
        '      // no runtime writer, nothing existing altered). This list is pinned deliberately',
      ]);
      expect(inventory.added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
        "    it('records versions 0001 through 0014 with no gaps', async () => {",
        "        '0014',",
      ]);

      // A1 frame: one manifest entry, the frozen stamp and frameContract.ts untouched.
      const frame = diffLines(A1_FRAME_TEST);
      expect(frame.removed).toEqual([]);
      expect(frame.added).toEqual([
        '  {',
        "    file: '0014_discovery_subject_writer.sql',",
        "    adr: 'docs/adr/0020-controlled-discovery-subject-registry.md',",
        "    ownerRecord: 'docs/evaluation/TRACK_B_B2_2_DISCOVERY_SUBJECT_REGISTRY_OWNER_DECISION_V1.json',",
        '  },',
      ]);

      // B2.1 schema test: the catalogue claim scoped to the roles B2.1 governs;
      // the writer's exact grants are asserted by the B2.2 integration test.
      const b21Schema = diffLines(B21_SCHEMA_TEST);
      expect(b21Schema.removed).toEqual([]);
      expect(b21Schema.added.filter((l) => !/^\s*--/.test(l))).toEqual([
        "            AND grantee <> 'nwf_discovery_subject_writer'",
      ]);

      // B2.1 firewall: "nothing calls the identity module" read at B2.1's own terminal commit.
      const b21Firewall = diffLines(B21_FIREWALL);
      expect(b21Firewall.removed).toEqual([
        '/** Every production TypeScript file (non-test) under `src/`. */',
        "      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));",
      ]);
      const added = b21Firewall.added.join('\n');
      expect(added).toContain(
        "'ls-tree', '-r', '--name-only', REPAIR_TERMINAL_COMMIT, '--', 'src'",
      );
      expect(added).toContain('      const code = codeOf(sourceOf(file));');
      for (const file of [SCHEMA_INVENTORY, A1_FRAME_TEST, B21_SCHEMA_TEST, B21_FIREWALL]) {
        expect(diffLines(file).added.join('\n'), file).not.toMatch(
          /\.skip\(|\.todo\(|\.only\(|process\.env/,
        );
      }
    });
  },
);

describe('B2.2 registry module: narrow, local and inert towards research', () => {
  it('consists of exactly the five reviewed files', () => {
    const present = productionFilesOfThisSlice().filter((f) => f.startsWith(REGISTRY_DIR));
    expect(present).toEqual([...REGISTRY_FILES].sort());
  });

  it('imports only B2.1 identity, its siblings, node:crypto and pg types', () => {
    for (const file of REGISTRY_FILES) {
      const imports = [...codeOf(sourceOf(file)).matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const target of imports) {
        expect(target, `${file} imports ${target}`).toMatch(
          /^(\.\/[a-zA-Z]+\.js|\.\.\/identity\/[a-zA-Z]+\.js|node:crypto|pg)$/,
        );
      }
    }
    const cli = [...codeOf(sourceOf(CLI_COMMAND)).matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
    for (const target of cli) {
      expect(target, `${CLI_COMMAND} imports ${target}`).toMatch(
        /^(node:util|pg|\.\.\/\.\.\/db\/client\.js|\.\.\/\.\.\/config\/env\.js|\.\.\/\.\.\/orgunits\/identity\/vocabulary\.js|\.\.\/\.\.\/orgunits\/subjectRegistry\/[a-zA-Z]+\.js)$/,
      );
    }
  });

  it('opens no socket, calls no fetch, touches no file and reads no environment but the seam guard', () => {
    for (const file of [...REGISTRY_FILES, CLI_COMMAND]) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/\bfetch\s*\(|node:(net|tls|http|https|dns|fs|child_process)/);
      expect(code, file).not.toMatch(/readFile|writeFile|createReadStream|createWriteStream/);
      const envReads = code.match(/process\.env/g) ?? [];
      expect(envReads.length, file).toBe(
        file === 'src/orgunits/subjectRegistry/reviewAuthority.ts' ? 1 : 0,
      );
    }
  });

  it('calls no model, starts no research, and imports no classifier, orchestrator or gateway', () => {
    for (const file of [...REGISTRY_FILES, CLI_COMMAND]) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /orgunits\/(classify|orchestrator|web|signals)|sitemap|claude-agent-sdk|anthropic|executeWebAttempt|runOrganisationDiscovery|runRootAcquisition/i,
      );
    }
    // And nothing on the research or classifier side reads the registry.
    // HISTORICAL (B2.2 as accepted, over the pinned tree): nothing outside the
    // registry and its CLI named the registry at all.
    for (const file of productionFilesOfThisSlice()) {
      if (file.startsWith(REGISTRY_DIR) || file === CLI_COMMAND || file === CLI_ENTRY) continue;
      expect(codeOf(sourceOf(file)), file).not.toMatch(/subjectRegistry|discoverySubjects/);
    }
    // CURRENT (working tree): the same, except that exactly the B2.4-R1a
    // projection files may import exactly the pure read-model modules. The
    // original check then runs on what remains, so any other registry module
    // (writer, store, review authority, evidence binding) still fails.
    for (const file of productionFiles()) {
      if (file.startsWith(REGISTRY_DIR) || file === CLI_COMMAND || file === CLI_ENTRY) continue;
      let code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      if (B24_READ_MODEL_IMPORTERS.includes(file)) code = code.replace(B24_READ_MODEL_IMPORT, '');
      expect(code, file).not.toMatch(/subjectRegistry|discoverySubjects/);
    }
  });

  it('wires the B2.1 identity module into exactly the registry and its CLI', () => {
    const importers = productionFilesOfThisSlice().filter(
      (f) =>
        !f.startsWith('src/orgunits/identity/') &&
        /orgunits\/identity\/|\.\.\/identity\//.test(codeOf(sourceOf(f))),
    );
    expect(importers).toEqual(
      [
        CLI_COMMAND,
        'src/orgunits/subjectRegistry/readModel.ts',
        'src/orgunits/subjectRegistry/requests.ts',
        'src/orgunits/subjectRegistry/store.ts',
        'src/orgunits/subjectRegistry/writer.ts',
      ].sort(),
    );
    const naming = productionFilesOfThisSlice().filter((f) =>
      TABLES.some((t) => codeOf(sourceOf(f)).includes(t)),
    );
    expect(naming).toEqual([
      'src/orgunits/subjectRegistry/store.ts',
      'src/orgunits/subjectRegistry/writer.ts',
    ]);
  });

  it('issues a closed set of SQL: SELECTs, and INSERTs into the four tables from writer.ts only', () => {
    for (const file of [...REGISTRY_FILES, CLI_COMMAND]) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\bUPDATE\s+\w+\s+SET|\bDELETE\s+FROM|\bTRUNCATE\b|\b(ALTER|DROP|CREATE)\s+(TABLE|ROLE|FUNCTION|TRIGGER|INDEX)|\bGRANT\s|\bREVOKE\s|\bCOPY\s|session_replication_role|DISABLE\s+TRIGGER/i,
      );
      const inserts = [...code.matchAll(/INSERT INTO (\w+)/g)].map((m) => m[1]);
      expect(inserts, file).toEqual(
        file === 'src/orgunits/subjectRegistry/writer.ts' ? [...TABLES] : [],
      );
    }
    expect(codeOf(sourceOf('src/orgunits/subjectRegistry/store.ts'))).not.toMatch(/INSERT/);
  });

  it('scores, qualifies and prioritises nothing, creates no opportunity and declares no contact or verdict property', () => {
    for (const file of [...REGISTRY_FILES, CLI_COMMAND]) {
      const source = sourceOf(file);
      const code = codeOf(source);
      expect(code, file).not.toMatch(/score|qualif|priorit|opportunit|outreach|commercial|weight/i);
      expect(source, file).not.toMatch(/\b(email|mailbox|emailAddress|contact\w*)\s*[:?]/i);
      expect(source, file).not.toMatch(/\b(phone|telephone|phoneNumber|mobile)\s*[:?]/i);
      expect(code, file).not.toMatch(
        /\b(verified|isVerified|relevant|preferred|approved|qualified|eligible|parentId)\s*[:?]/,
      );
      expect(code, file).not.toMatch(/\bmerge\w*\s*\(|canonicalEntity/i);
    }
  });

  it('never grants research authority: the read model fixes it to false, and no research command exists for subjects', () => {
    const readModel = codeOf(sourceOf('src/orgunits/subjectRegistry/readModel.ts'));
    expect(readModel).toMatch(/readonly granted: false;/);
    expect(readModel).not.toMatch(/granted:\s*true/);
    expect(readModel).toMatch(/researchAuthority: \{ granted: false, status: 'NOT_GRANTED'/);
    expect(readModel).not.toMatch(/evaluationCohortGuard|researchCohortGuard|loadEvaluationCohort/);
    expect(Object.keys(DISCOVERY_SUBJECTS_OPTIONS).sort()).toEqual(
      ['claim', 'list', 'propose', 'relate', 'review', 'show'].sort(),
    );
  });
});

describe('B2.2 review authority: never a string, never a production constructor', () => {
  const authority = codeOf(sourceOf('src/orgunits/subjectRegistry/reviewAuthority.ts'));

  it('brands the capability privately and mints it only through the vitest-guarded seam', () => {
    expect(authority).toMatch(/readonly #sealed = true;/);
    expect(authority).toMatch(/private constructor\(actorKey: string\)/);
    expect([...authority.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'isContext',
      'testSeam',
    ]);
    expect(authority).toContain("if (process.env['VITEST'] !== 'true') {");
    expect(authority.match(/new TrustedReviewerContext\(/g)).toHaveLength(1);
  });

  it('is minted and recorded by no production file, and the review writer checks the brand', () => {
    for (const file of productionFiles()) {
      if (file === 'src/orgunits/subjectRegistry/reviewAuthority.ts') continue;
      const code = codeOf(readFileSync(join(REPO_ROOT, file), 'utf8'));
      expect(code, file).not.toMatch(/\btestSeam\s*\(|new TrustedReviewerContext/);
      if (file !== 'src/orgunits/subjectRegistry/writer.ts') {
        expect(code, file).not.toMatch(/\brecordReview\b/);
      }
    }
    const writer = codeOf(sourceOf('src/orgunits/subjectRegistry/writer.ts'));
    expect(writer).toMatch(/TrustedReviewerContext\.isContext\(reviewer\)/);
    expect(writer).toMatch(/actorKey: string,\n\): Promise<Judged>/);
    expect(writer).toContain('reviewer.actorKey');
  });

  it('accepts no actor key, no credential and no generic mutation option on any command', () => {
    for (const [command, spec] of Object.entries(DISCOVERY_SUBJECTS_OPTIONS)) {
      for (const option of Object.keys(spec)) {
        expect(option, command).not.toMatch(
          /actor|owner|reviewer|role|user|password|token|secret|connection|database|sql|query|set|field|json-input|file|csv|import|bulk|all|force|email|phone|contact/,
        );
      }
    }
    const cli = codeOf(sourceOf(CLI_COMMAND));
    expect(cli).toMatch(/strict: true,\s+allowPositionals: false,/);
    // Review execution is refused before any planning or connection.
    expect(cli.indexOf('REVIEWER_TRUST_PRIMITIVE_ABSENT,\n')).toBeGreaterThan(0);
    expect(cli.indexOf("case 'review': {\n        if (execute) {")).toBeGreaterThan(0);
    expect(cli.indexOf("case 'review': {\n        if (execute) {")).toBeLessThan(
      cli.indexOf('planReview(pool, request)'),
    );
  });

  it('records CLI rows under the bound path key only', () => {
    const requests = codeOf(sourceOf('src/orgunits/subjectRegistry/requests.ts'));
    expect(requests).toContain(
      "export const REGISTRY_WRITER_ACTOR_KEY = 'discovery-subjects-cli';",
    );
    expect(requests.match(/recordedByActorKey: REGISTRY_WRITER_ACTOR_KEY/g)).toHaveLength(1);
    expect(requests.match(/registeredByActorKey: REGISTRY_WRITER_ACTOR_KEY/g)).toHaveLength(1);
    expect(requests).not.toMatch(/recordedByActorKey:\s*[a-z]+\.|registeredByActorKey:\s*[a-z]+\./);
  });
});

describe('B2.2 migration 0014: one capability, exactly its grants, no review write', () => {
  const sql = sqlCodeOf(readFileSync(join(REPO_ROOT, MIGRATION), 'utf8'));

  it('creates one NOLOGIN role, one function and three triggers, and nothing else', () => {
    expect(
      [...sql.matchAll(/CREATE ROLE (\w+)([^;]*);/g)].map((m) => [m[1], m[2]!.trim()]),
    ).toEqual([['nwf_discovery_subject_writer', 'NOLOGIN']]);
    expect(sql).toMatch(
      /ALTER ROLE nwf_discovery_subject_writer\s+NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;/,
    );
    expect([...sql.matchAll(/CREATE FUNCTION (\w+)/g)].map((m) => m[1])).toEqual([
      'discovery_identity_bind_writer_actor',
    ]);
    expect(
      [...sql.matchAll(/CREATE TRIGGER (\w+)\s+BEFORE INSERT ON (\w+)/g)].map((m) => m[2]),
    ).toEqual([
      'discovery_subjects',
      'discovery_subject_identity_claims',
      'discovery_subject_relationship_claims',
    ]);
    expect(sql).not.toMatch(/CREATE (TABLE|VIEW|INDEX|SEQUENCE|SCHEMA)|ALTER TABLE|\bDROP\b/i);
    expect(sql).not.toMatch(/^\s*(INSERT INTO|UPDATE \w+ SET|DELETE FROM|TRUNCATE)\b/im);
    expect(sql).not.toMatch(/SECURITY DEFINER|\bLOGIN PASSWORD\b|PASSWORD '|\bjsonb?\b/i);
  });

  it('grants exactly the declared privileges, to the writer only', () => {
    const grants = [
      ...sql.matchAll(/\bGRANT\s+([A-Za-z, ()_]+?)\s+ON\s+([^;]+?)\s+TO\s+([a-z_]+)/g),
    ].map((m) => [m[1]!.replace(/\s+/g, ' '), m[2]!.replace(/\s+/g, ' ').trim(), m[3]]);
    expect(grants).toEqual([
      ['CONNECT', 'DATABASE %I', 'nwf_discovery_subject_writer'],
      ['USAGE', 'SCHEMA public', 'nwf_discovery_subject_writer'],
      [
        'SELECT, INSERT',
        'discovery_subjects, discovery_subject_identity_claims, discovery_subject_relationship_claims',
        'nwf_discovery_subject_writer',
      ],
      ['SELECT', 'discovery_subject_reviews', 'nwf_discovery_subject_writer'],
      ['SELECT (eche_row_key)', 'organisations', 'nwf_discovery_subject_writer'],
    ]);
    expect(sql).not.toMatch(/GRANT\s+nwf_discovery_subject_writer\s+TO/i);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|REFERENCES|TEMPORARY|TEMP)\b[^;]*\bTO\b/);
    expect(sql).not.toMatch(
      /GRANT[^;]*\b(nwf_research|nwf_ingest|nwf_classifier|nwf_readonly|PUBLIC)\b/,
    );
  });

  it('binds the recorded actor of every non-owner INSERT to the CLI path key', () => {
    expect(sql).toMatch(/IF pg_has_role\(current_user, table_owner, 'MEMBER'\) THEN\s+RETURN NEW;/);
    expect(sql).toMatch(/IF recorded IS DISTINCT FROM 'discovery-subjects-cli' THEN/);
    expect(sql).toMatch(/ERRCODE = '42501'/);
  });
});

/**
 * B2.2-C. The canonical identity boundary. Track C issues canonical Candidate
 * (`cand:`) and Channel (`chn:`) identifiers and Track D issues Opportunity
 * (`opp:`) identifiers; a B subject id is a provisional, B-local UUID and
 * nothing more (ADR 0020 s12). These checks are SCOPED to the registry and
 * its CLI - documentation, tests and a future, separately authorised adapter
 * may still name those prefixes as EXTERNAL data. The behavioural half (the
 * CLI refusing canonical-shaped ids and equivalence predicates, the database
 * refusing them by type and CHECK, shared identifiers staying a review
 * signal) lives in discoverySubjectRegistryB22.test.ts and
 * discoverySubjectRegistry.test.ts.
 */
describe('B2.2-C canonical identity boundary: the registry issues no canonical identity', () => {
  const REGISTRY_AND_CLI = [...REGISTRY_FILES, CLI_COMMAND];
  const EQUIVALENCE =
    /SAME|EQUIVAL|DUPLICATE|MERGE|SPLIT|ALIAS|CANONICAL|SUPERSED|CANDIDATE|CHANNEL|OPPORTUNIT/;

  it('mints record ids only through node:crypto randomUUID, in writer.ts only', () => {
    for (const file of REGISTRY_AND_CLI) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\b(randomBytes|getRandomValues|gen_random_uuid|uuid_generate_v\d|nextval|uuidv\d|nanoid|ulid)\b/,
      );
      const minted = code.match(/\brandomUUID\b/g) ?? [];
      if (file === 'src/orgunits/subjectRegistry/writer.ts') {
        expect(code).toContain("import { randomUUID } from 'node:crypto';");
        // Every call feeds a B2.1 record id; none is prefixed or reshaped.
        expect(code).not.toMatch(
          /[`'"+]\s*randomUUID\(\)|\$\{\s*randomUUID\(\)|randomUUID\(\)\s*[+`.]/,
        );
      } else {
        expect(minted, file).toEqual([]);
      }
    }
  });

  it('builds no cand:, chn: or opp: identifier and names no canonical reference', () => {
    for (const file of REGISTRY_AND_CLI) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/[`'"](cand|chn|opp):/);
      expect(code, file).not.toMatch(
        /\b(candidate|channel|opportunity|canonical)_?(id|ids|ref|refs|key|uri)\b/i,
      );
      expect(code, file).not.toMatch(
        /sameActor|SAME_ACTOR|mergedInto|MERGED_INTO|equivalentTo|EQUIVALENT_TO|splitFrom|SPLIT_FROM/,
      );
    }
  });

  it('exports no merge, split, link, equivalence, promotion, canonical or handoff operation', () => {
    const exported = [
      registryReadModel,
      registryRequests,
      registryReviewAuthority,
      registryStore,
      registryWriter,
    ].flatMap((m) => Object.keys(m));
    expect(exported.length).toBeGreaterThan(0);
    for (const name of exported) {
      expect(name).not.toMatch(
        /merge|split|unify|dedup|resolv|link|equivalen|sameActor|promot|canonical|issue|mint|handoff|adopt|candidate|channel|opportunit/i,
      );
    }
    // The writer's mutating surface is exactly the four append operations.
    expect(
      Object.keys(registryWriter)
        .filter((k) => /^(execute|record)/.test(k))
        .sort(),
    ).toEqual(['executeClaim', 'executePropose', 'executeRelate', 'recordReview']);
  });

  it('carries no equivalence-shaped predicate, outcome, kind, source or identifier scheme', () => {
    for (const value of [
      ...RELATIONSHIP_PREDICATES,
      ...REVIEW_OUTCOMES,
      ...IDENTITY_CLAIM_KINDS,
      ...SUBJECT_KINDS,
      ...SOURCE_TYPES,
      ...Object.keys(IDENTIFIER_SHAPES),
    ]) {
      expect(value).not.toMatch(EQUIVALENCE);
    }
    expect(Object.keys(IDENTIFIER_SHAPES).sort()).toEqual(['EU_PIC', 'FR_RNA', 'NL_KVK']);
  });

  it('adds no canonical-reference column and no table: 0014 only creates a role, a function and triggers', () => {
    const sql = sqlCodeOf(readFileSync(join(REPO_ROOT, MIGRATION), 'utf8'));
    expect(sql).not.toMatch(/\bADD\s+COLUMN\b|ALTER\s+TABLE|CREATE\s+(TABLE|VIEW|TYPE|DOMAIN)/i);
    expect(sql).not.toMatch(/\b(cand|chn|opp):|canonical|candidate|channel|opportunit/i);
    expect(sql).not.toMatch(/\bnwf_identity\w*/);
  });

  it('offers no subcommand that could merge, split, link, register canonically or hand off', () => {
    for (const command of Object.keys(DISCOVERY_SUBJECTS_OPTIONS)) {
      expect(command).not.toMatch(
        /merge|split|link|equivalen|same|promot|canonical|handoff|register|adopt|resolve/i,
      );
    }
    for (const [command, spec] of Object.entries(DISCOVERY_SUBJECTS_OPTIONS)) {
      for (const option of Object.keys(spec)) {
        expect(option, command).not.toMatch(/cand|chn|opp|canonical|channel|handoff|same|merge/i);
      }
    }
  });
});

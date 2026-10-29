/**
 * TRACK B, B2.1 - THE ISOLATION TEST FOR FIRST-CLASS DISCOVERY-SUBJECT
 * IDENTITY.
 *
 * Per the phase-isolation convention this change is pinned by its OWN
 * repair-scope file over its OWN commit range; no older firewall was edited.
 * It proves, from the real git range and the real source:
 *
 *   - the change set is EXACTLY the authorised files, by path and status, and
 *     the modified test-support files changed only as acknowledged, and no
 *     evaluation harness (the frozen A2 corpus namespace included) changed;
 *   - B1.1 (frontier, fetch policy v8, budgets), B3.0 (the research cohort
 *     guard), the classifier guard and its pinned artifacts, the gateway,
 *     robots, signals, the CLI, ingestion and every earlier migration are
 *     unchanged;
 *   - the identity module is PURE and NOTHING calls it: no socket, no
 *     database, no environment, no clock, no randomness, no SQL, no research
 *     or classifier import, and no production importer;
 *   - it grants no research authority, reads no cohort state, scores nothing,
 *     and declares no contact-shaped property;
 *   - migration 0013 grants no runtime role a write, gives nwf_research
 *     nothing at all, alters no pre-existing table, runs no DML, declares no
 *     contact, verdict, eligibility or jsonb column, and is append-only by
 *     trigger on all four tables.
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

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The accepted B3.0 tip (research cohort guard, firewall pinned). */
const REPAIR_BASE_COMMIT = 'c71c2694ba47a4c3344b863382691aaebb93f22e';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = 'ee39c7a9fee6a591e553c7db76a09eed7c391c90';

const MIGRATION = 'migrations/0013_discovery_subject_identity.sql';
const IDENTITY_DIR = 'src/orgunits/identity/';
const IDENTITY_FILES = [
  'src/orgunits/identity/admissibility.ts',
  'src/orgunits/identity/structuralParent.ts',
  'src/orgunits/identity/validate.ts',
  'src/orgunits/identity/vocabulary.ts',
];
const INTEGRATION_HELPERS = 'src/test/integration/helpers.ts';
const SCHEMA_INVENTORY = 'src/test/integration/orgunitSchema.test.ts';
/** The three historical tests B2.1-R1 range-scoped (OWNER-authorised, ADR 0019 s10). */
const A1_FRAME_TEST = 'src/test/unit/orgunitCorpus2DA1Frame.test.ts';
const TRANSPORT_RETRY_POLICY_TEST = 'src/test/unit/orgunitTransportRetryPolicy.test.ts';
const READ_MODELS_TEST = 'src/test/unit/classifierOperatorReadModelsV1.test.ts';
const NEW_TABLES = [
  'discovery_subjects',
  'discovery_subject_identity_claims',
  'discovery_subject_relationship_claims',
  'discovery_subject_reviews',
];

/** The exact authorised change set, as `git diff --name-status` lines. */
const AUTHORISED_CHANGESET = [
  'A\tdocs/adr/0019-first-class-discovery-subject-identity.md',
  'A\tdocs/evaluation/TRACK_B_B2_1_MICRO_ORGANISATION_IDENTITY_OWNER_DECISION_V1.json',
  `A\t${MIGRATION}`,
  ...IDENTITY_FILES.map((f) => `A\t${f}`),
  'A\tsrc/test/firewall/phase2bDiscoverySubjectIdentity.firewall.test.ts',
  'A\tsrc/test/helpers/discoveryIdentityFixtures.ts',
  'A\tsrc/test/integration/discoveryIdentitySchema.test.ts',
  `M\t${INTEGRATION_HELPERS}`,
  `M\t${SCHEMA_INVENTORY}`,
  'A\tsrc/test/unit/discoveryIdentityB21.test.ts',
  `M\t${A1_FRAME_TEST}`,
  `M\t${TRANSPORT_RETRY_POLICY_TEST}`,
  `M\t${READ_MODELS_TEST}`,
].sort();

/** Paths this change may not touch at all. */
const FORBIDDEN_PATHS = [
  'src/orgunits/classify/',
  'src/orgunits/web/',
  'src/orgunits/signals/',
  'src/orgunits/orchestrator/',
  'src/orgunits/sitemap.ts',
  'src/cli/',
  'src/ingest/',
  'src/website/',
  'src/compare/',
  'src/db/',
  'src/config/',
  'src/logging/',
  'src/test/helpers/syntheticCohortRegistry.ts',
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

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return execFileSync('git', ['-C', REPO_ROOT, 'show', `${REPAIR_TERMINAL_COMMIT}:${path}`], {
    encoding: 'utf8',
  });
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** SQL with `--` comments removed, so prose explaining a refusal never trips the check. */
function sqlCodeOf(source: string): string {
  return source.replace(/--.*$/gm, '');
}

/**
 * Every production TypeScript file (non-test) under `src/` - at the B2.1
 * terminal commit once it is pinned. "Nothing calls the identity module" is a
 * claim about B2.1; B2.2 (ADR 0020) is the separately authorised slice that
 * wires it, and its own firewall pins exactly which files may.
 */
function productionFiles(): string[] {
  if (REPAIR_TERMINAL_COMMIT !== null) {
    return execFileSync(
      'git',
      ['-C', REPO_ROOT, 'ls-tree', '-r', '--name-only', REPAIR_TERMINAL_COMMIT, '--', 'src'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter((f) => f.endsWith('.ts') && !f.startsWith('src/test/'))
      .sort();
  }
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
  'B2.1 discovery-subject identity: the change stays inside its authorised scope',
  () => {
    it('changes exactly the authorised files, by path and status', () => {
      expect(changeset()).toEqual(AUTHORISED_CHANGESET);
    });

    it('touches no research, classifier, gateway, signal, CLI, ingestion, dependency or cohort-artifact path', () => {
      expect(changeset(...FORBIDDEN_PATHS)).toEqual([]);
    });

    it('adds exactly one migration and edits no earlier one', () => {
      expect(changeset('migrations/')).toEqual([`A\t${MIGRATION}`]);
    });

    it('adds exactly one firewall and edits no earlier one', () => {
      expect(changeset('src/test/firewall/')).toEqual([
        'A\tsrc/test/firewall/phase2bDiscoverySubjectIdentity.firewall.test.ts',
      ]);
    });

    it('touches no evaluation harness: the A3 R33-R37 freeze of the A2 corpus harness holds', () => {
      // frameContract.ts's DATABASE_SCHEMA_VERSION_RANGE stays 0001..0012: the
      // A3 V4 isolation tests freeze that namespace, so B2.1-R1 range-scoped
      // the A1 test instead of bumping the stamp (ADR 0019 s10).
      expect(changeset('src/test/harness/')).toEqual([]);
    });

    it('changes each historical test only by moving its migration claim off the current tree', () => {
      // Exactly the removed lines, so no other assertion in these files moved.
      expect(diffLines(A1_FRAME_TEST).removed).toEqual([
        "import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';",
        "  it('declares exactly the migration range present in migrations/, with no privilege needed to check it', () => {",
        "    const versions = readdirSync(join(REPO_ROOT, 'migrations'))",
        "      .filter((name) => name.endsWith('.sql'))",
        '      .map((name) => name.slice(0, 4))',
        '      .sort();',
        '    expect(versions.length).toBeGreaterThan(0);',
        '    expect(DATABASE_SCHEMA_VERSION_RANGE).toBe(`${versions[0]}..${versions[versions.length - 1]}`);',
      ]);
      expect(diffLines(TRANSPORT_RETRY_POLICY_TEST).removed).toEqual([
        "    const migrations = execFileSync('git', ['-C', REPO_ROOT, 'ls-files', 'migrations'], {",
        "      encoding: 'utf8',",
        '    })',
      ]);
      expect(diffLines(READ_MODELS_TEST).removed).toEqual([
        "    const now = lines(git('ls-files', 'migrations'));",
        "    expect(now).toEqual(lines(git('ls-tree', '-r', '--name-only', T, '--', 'migrations')));",
        '    expect(now.at(-1)).toMatch(/^migrations\\/0012_/);',
        "    expect(lines(git('diff', '--name-only', T, R, '--', 'migrations'))).toEqual([]);",
      ]);

      // The replacements read history, never the current index, and keep
      // every original bound.
      const a1 = diffLines(A1_FRAME_TEST).added.join('\n');
      expect(a1).toContain(
        "const FRAME_SCHEMA_STAMP_COMMIT = 'cbbedd8ea8eaa62580c1fe8c05a95508400161db';",
      );
      expect(a1).toContain(
        "const CORPUS_FREEZE_BASE = '747b64fa40c93e4b871ea1675682fb1531b21341';",
      );
      expect(a1).toContain("file: '0013_discovery_subject_identity.sql',");
      expect(a1.match(/^\s+file: '/gm)).toHaveLength(1);
      const retry = diffLines(TRANSPORT_RETRY_POLICY_TEST).added.join('\n');
      expect(retry).toContain(
        "const ADR_0015_STARTING_HEAD = '3ecbd89628bc3e0f88ae4b424646a37f6b5a0575';",
      );
      expect(retry).toContain(
        "const ADR_0015_CLOSURE_COMMIT = 'e5642595da1ac68e3d17c59d5a3348a3557f0e9c';",
      );
      const readModels = diffLines(READ_MODELS_TEST).added.join('\n');
      expect(readModels).toContain(
        "const atTerminal = lines(git('ls-tree', '-r', '--name-only', R, '--', 'migrations'));",
      );
      expect(readModels).toContain(
        "expect(lines(git('diff', '--name-status', T, R, '--', 'migrations'))).toEqual([]);",
      );
      for (const file of [A1_FRAME_TEST, TRANSPORT_RETRY_POLICY_TEST, READ_MODELS_TEST]) {
        const added = diffLines(file).added.join('\n');
        expect(added, file).not.toMatch(/ls-files|\.skip\(|\.todo\(|process\.env/);
      }
    });

    it('only adds the four new tables to the integration-test TRUNCATE inventory', () => {
      const { removed, added } = diffLines(INTEGRATION_HELPERS);
      expect(removed).toEqual([
        '    `TRUNCATE orgunit_classification_subjects, orgunit_page_classifications,',
      ]);
      const code = added.filter((l) => !/^\s*\/\//.test(l));
      expect(code).toEqual([
        '    `TRUNCATE discovery_subject_reviews, discovery_subject_relationship_claims,',
        '              discovery_subject_identity_claims, discovery_subjects,',
        '              orgunit_classification_subjects, orgunit_page_classifications,',
      ]);
    });

    it('acknowledges 0013 in the schema inventory and changes nothing else there', () => {
      const { removed, added } = diffLines(SCHEMA_INVENTORY);
      expect(removed).toEqual([
        "    it('records versions 0001 through 0012 with no gaps', async () => {",
        '      // nullable, no backfill, no grant). This list is pinned deliberately',
      ]);
      expect(added.filter((l) => !/^\s*\/\//.test(l))).toEqual([
        "    it('records versions 0001 through 0013 with no gaps', async () => {",
        "        '0013',",
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
  },
);

describe('B2.1 identity module: pure, inert and unwired', () => {
  it('consists of exactly the four reviewed files', () => {
    const present = readdirSync(join(REPO_ROOT, IDENTITY_DIR))
      .map((f) => `${IDENTITY_DIR}${f}`)
      .sort();
    expect(present).toEqual([...IDENTITY_FILES].sort());
  });

  it('imports only its own sibling modules', () => {
    for (const file of IDENTITY_FILES) {
      const imports = [...codeOf(sourceOf(file)).matchAll(/from '([^']+)'/g)].map((m) => m[1]!);
      for (const target of imports) {
        expect(target, `${file} imports ${target}`).toMatch(/^\.\/[a-zA-Z]+\.js$/);
      }
    }
  });

  it('opens no socket, database, file or environment, and reads no clock or randomness', () => {
    for (const file of IDENTITY_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/\bfetch\s*\(|node:|from 'pg'|process\.|require\(/);
      expect(code, file).not.toMatch(/Date\.now|new Date\b|Math\.random|performance\.now/);
      expect(code, file).not.toMatch(/readFile|writeFile|createReadStream|createWriteStream/);
    }
  });

  it('issues no SQL and names no table: it cannot persist or read anything', () => {
    for (const file of IDENTITY_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE|TRUNCATE)\b\s/);
      for (const table of NEW_TABLES) expect(code, file).not.toContain(table);
    }
  });

  it('has no production importer, and no production code names the new tables', () => {
    for (const file of productionFiles()) {
      if (file.startsWith(IDENTITY_DIR)) continue;
      const code = codeOf(sourceOf(file));
      expect(code, `${file} imports the identity module`).not.toMatch(
        /orgunits\/identity\/|\.\.\/identity\//,
      );
      for (const table of NEW_TABLES) {
        expect(code, `${file} names ${table}`).not.toContain(table);
      }
    }
  });

  it('grants no research authority and builds no eligibility of its own', () => {
    for (const file of IDENTITY_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/eligib|ELIGIBLE|authoris|authoriz|permitted|allowResearch/i);
      expect(code, file).not.toMatch(/grantsResearchAuthority:\s*true/);
    }
    const evaluator = codeOf(sourceOf('src/orgunits/identity/structuralParent.ts'));
    expect(evaluator).toMatch(/readonly grantsResearchAuthority: false;/);
    expect(evaluator.match(/grantsResearchAuthority: false,/g)).toHaveLength(1);
  });

  it('reads no cohort state and reuses none of the B3.0 refusal vocabulary', () => {
    for (const file of IDENTITY_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /cohort|holdout|DEV_TRAIN|researchCohortGuard|evaluationCohortGuard/i,
      );
      expect(code, file).not.toMatch(/COHORT_INELIGIBLE|RESEARCH_IDENTITY_AUTHORITY_ABSENT/);
    }
  });

  it('scores, qualifies and prioritises nothing, and has no outreach or opportunity notion', () => {
    for (const file of IDENTITY_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/score|qualif|priorit|opportunit|outreach|commercial|weight/i);
    }
  });

  it('declares no contact-shaped or verdict-shaped property', () => {
    for (const file of IDENTITY_FILES) {
      const source = sourceOf(file);
      expect(source, file).not.toMatch(/\b(email|mailbox|emailAddress|contact\w*)\s*[:?]/i);
      expect(source, file).not.toMatch(/\b(phone|telephone|phoneNumber|mobile)\s*[:?]/i);
      expect(codeOf(source), file).not.toMatch(
        /\b(verified|isVerified|relevant|preferred|approved|qualified|isUnit|parentId)\s*[:?]/,
      );
    }
  });

  it('never merges: no merge, canonical-entity or case-folding notion (edit distance is banned repo-wide by phase1b)', () => {
    for (const file of IDENTITY_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\bmerge|canonicalEntity|toLowerCase|toUpperCase|normalize\(/i,
      );
    }
  });
});

describe('B2.1 migration 0013: no runtime writer, append-only, no verdicts', () => {
  const sql = sqlCodeOf(readFileSync(join(REPO_ROOT, MIGRATION), 'utf8'));

  it('creates exactly the four tables, three admissibility/refusal functions and four triggers', () => {
    expect([...sql.matchAll(/CREATE TABLE (\w+)/g)].map((m) => m[1]).sort()).toEqual(
      [...NEW_TABLES].sort(),
    );
    expect([...sql.matchAll(/CREATE FUNCTION (\w+)/g)].map((m) => m[1]).sort()).toEqual([
      'discovery_identity_refuse_mutation',
      'discovery_identity_text_admissible',
      'discovery_identity_url_admissible',
    ]);
    for (const table of NEW_TABLES) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE TRIGGER ${table}_append_only\\s+BEFORE UPDATE OR DELETE ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION discovery_identity_refuse_mutation\\(\\)`,
        ),
      );
    }
  });

  it('grants SELECT to nwf_readonly and nothing else to anyone', () => {
    const grants = [
      ...sql.matchAll(/\bGRANT\s+([A-Za-z, ]+?)\s+ON\s+([^;]+?)\s+TO\s+([a-z_, ]+)/g),
    ];
    expect(grants).toHaveLength(1);
    expect(grants[0]![1]).toBe('SELECT');
    expect(grants[0]![3]!.trim()).toBe('nwf_readonly');
    expect(sql).toMatch(
      /REVOKE ALL ON discovery_subjects, discovery_subject_identity_claims,\s+discovery_subject_relationship_claims, discovery_subject_reviews\s+FROM PUBLIC, nwf_ingest, nwf_research, nwf_classifier, nwf_readonly;/,
    );
    expect(sql).not.toMatch(/GRANT[^;]*\b(nwf_research|nwf_ingest|nwf_classifier)\b/);
    expect(sql).not.toMatch(/CREATE ROLE|ALTER ROLE|GRANT\s+TEMPORARY|SECURITY DEFINER/i);
  });

  it('alters no pre-existing table and runs no DML', () => {
    const altered = [...sql.matchAll(/ALTER TABLE (\w+)/g)].map((m) => m[1]);
    expect(altered).toEqual(['discovery_subject_reviews']);
    expect(sql).not.toMatch(/^\s*(INSERT INTO|UPDATE \w+ SET|DELETE FROM|TRUNCATE)\b/im);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it('declares no contact, verdict, eligibility, score, status, parent or free-form json column', () => {
    const columns = [
      ...sql.matchAll(
        /^\s{4}([a-z_][a-z0-9_]*)\s+(?:uuid|text|integer|bigint|boolean|jsonb|json|numeric|timestamptz)/gim,
      ),
    ].map((m) => m[1]!);
    expect(columns.length).toBeGreaterThan(30);
    for (const column of columns) {
      expect(column).not.toMatch(
        /email|mailbox|phone|mobile|instagram|facebook|linkedin|person|contact|verified|confirmed|relevant|preferred|eligib|score|qualif|status|parent|priority|outreach/,
      );
    }
    expect(sql).not.toMatch(/\bjsonb?\b/i);
  });

  it('keeps a real foreign key to organisations by eche_row_key, never a copy of an ECHE row', () => {
    expect(sql).toMatch(/target_eche_row_key\s+text\s+REFERENCES organisations \(eche_row_key\)/);
    expect(sql).not.toMatch(/INSERT INTO organisations|CREATE TABLE organisations/);
  });

  it('makes no name, website or identifier unique across subjects', () => {
    const unique = [...sql.matchAll(/CREATE UNIQUE INDEX (\w+)\s+ON (\w+) \(([^)]*)\)/g)].map(
      (m) => `${m[2]}(${m[3]})`,
    );
    for (const index of unique) {
      expect(index).not.toMatch(
        /\((name_text|website_url|identifier_value|identifier_scheme, identifier_value)\)/,
      );
    }
    expect(sql).toMatch(
      /CREATE INDEX discovery_subject_identity_claims_identifier_idx\s+ON discovery_subject_identity_claims \(identifier_scheme, identifier_value\)/,
    );
  });
});

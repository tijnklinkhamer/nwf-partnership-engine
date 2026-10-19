/**
 * GLOBAL FOUNDATION R4 FIREWALL - worldwide jurisdiction evidence is
 * additive, unwired and permission-free.
 *
 * Pins, over the range REPAIR_BASE_COMMIT..REPAIR_TERMINAL_COMMIT (the working
 * tree while the terminal is open):
 *   - the change set is exactly the named files; nothing is deleted, the A1
 *     frame test gains exactly the 0016 manifest entry, and the R4.1 closure
 *     (OWNER brief "R4.1: Global Foundation Closure", 2026-10-19) changes
 *     exactly three lines elsewhere: the B2.5-M1-R3 terminal pin at ce8b220,
 *     and the two "newest migration" assertions moving from 0015 to 0016;
 *     the R4.2 closure (OWNER brief "R4.2 Final Closure", 2026-10-19) extends
 *     the exact orgunitSchema migration list from 0001-0015 to 0001-0016;
 *   - migrations 0001-0015 and every pre-existing docs/evaluation record are
 *     byte-identical, so no frozen B history or cohort pin moved;
 *   - migration 0016 alters, drops and rewrites nothing, grants only SELECT
 *     to nwf_readonly, and declares no contact, permission or locale column;
 *   - src/orgunits/subjectJurisdiction/ is pure, imports only itself, does not
 *     import the B2.1 identity namespace, and has no production importer.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** B2.5 F-1 correction R3 (`ce8b220`), the integration point R4 builds on. */
const REPAIR_BASE_COMMIT = 'ce8b220f675e095f1fedaa76b664e9c634e5ce57';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const REPAIR_TERMINAL_COMMIT: string | null = '59749b20ce8c1eb9f67fea2eed3b4926c9f61233';

const MIGRATION = 'migrations/0016_subject_jurisdiction_claims.sql';
const MODULE_DIR = 'src/orgunits/subjectJurisdiction/';
const MODULE_FILES = [`${MODULE_DIR}standing.ts`, `${MODULE_DIR}vocabulary.ts`];
const A1_FRAME_TEST = 'src/test/unit/orgunitCorpus2DA1Frame.test.ts';

/** R4.1 + R4.2: the OWNER-authorised test-maintenance edits, each pinned line for line below. */
const R3_FIREWALL = 'src/test/firewall/phase2bSubjectAcquisitionF1R3.firewall.test.ts';
const REGISTRY_TEST = 'src/test/integration/discoverySubjectRegistry.test.ts';
const SNAPSHOT_READ_TEST = 'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts';
const SCHEMA_TEST = 'src/test/integration/orgunitSchema.test.ts';
const CLOSURE_EDITS: Readonly<Record<string, { removed: string[]; added: string[] }>> = {
  [R3_FIREWALL]: {
    removed: ['const REPAIR_TERMINAL_COMMIT: string | null = null;'],
    added: [
      "const REPAIR_TERMINAL_COMMIT: string | null = 'ce8b220f675e095f1fedaa76b664e9c634e5ce57';",
    ],
  },
  [REGISTRY_TEST]: {
    removed: [
      '      // B2.3 (migration 0015, ADR 0023) is the newest migration now.',
      "      expect(rows[0]!.top).toBe('0015');",
    ],
    added: [
      '      // R4 (migration 0016, ADR 0024) is the newest migration now.',
      "      expect(rows[0]!.top).toBe('0016');",
    ],
  },
  [SNAPSHOT_READ_TEST]: {
    removed: ["      expect(top[0]!.top).toBe('0015');"],
    added: ["      expect(top[0]!.top).toBe('0016');"],
  },
  [SCHEMA_TEST]: {
    removed: [
      "    it('records versions 0001 through 0015 with no gaps', async () => {",
      '      // existing altered). This list is pinned deliberately',
    ],
    added: [
      "    it('records versions 0001 through 0016 with no gaps', async () => {",
      '      // existing altered), and for 0016 (R4 subject jurisdiction claims,',
      '      // ADR 0024, Proposed - one append-only claim table and one ISO 3166-1',
      '      // predicate, SELECT to nwf_readonly only; nothing existing altered).',
      '      // This list is pinned deliberately',
      "        '0016',",
    ],
  },
};

const AUTHORISED_CHANGESET = [
  'A\tdocs/adr/0024-worldwide-subject-jurisdiction-claims.md',
  'A\tdocs/evaluation/GLOBAL_FOUNDATION_R4_OWNER_BRIEF_RECORD_V1.json',
  `A\t${MIGRATION}`,
  ...MODULE_FILES.map((f) => `A\t${f}`),
  'A\tsrc/test/firewall/globalFoundationR4.firewall.test.ts',
  'A\tsrc/test/integration/subjectJurisdictionR4.test.ts',
  'A\tsrc/test/unit/subjectJurisdictionR4.test.ts',
  `M\t${A1_FRAME_TEST}`,
  ...Object.keys(CLOSURE_EDITS).map((f) => `M\t${f}`),
].sort();

function git(...args: readonly string[]): string {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], { encoding: 'utf8' });
}

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

function changeset(): string[] {
  const tracked = git('diff', '--name-status', '--find-renames', ...range());
  const untracked =
    REPAIR_TERMINAL_COMMIT === null
      ? git('ls-files', '--others', '--exclude-standard')
          .split('\n')
          .filter((l) => l.length > 0)
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function sourceOf(path: string): string {
  if (REPAIR_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return git('show', `${REPAIR_TERMINAL_COMMIT}:${path}`);
}

/** Source with comments removed, so prose never trips a capability check. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sqlCodeOf(source: string): string {
  return source.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
}

function productionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'test') walk(rel);
      } else if (rel.endsWith('.ts')) out.push(rel);
    }
  };
  walk('src');
  return out.sort();
}

describe.skipIf(!rangeAvailable)('R4: the change set over its own range', () => {
  it('is exactly the named files, with no deletion or rename', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits the A1 frame test only by appending the 0016 manifest entry', () => {
    const diff = git('diff', '--unified=0', ...range(), '--', A1_FRAME_TEST).split('\n');
    const removed = diff.filter((l) => l.startsWith('-') && !l.startsWith('---'));
    const added = diff
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1));
    expect(removed).toEqual([]);
    expect(added).toEqual([
      '  {',
      "    file: '0016_subject_jurisdiction_claims.sql',",
      "    adr: 'docs/adr/0024-worldwide-subject-jurisdiction-claims.md',",
      "    ownerRecord: 'docs/evaluation/GLOBAL_FOUNDATION_R4_OWNER_BRIEF_RECORD_V1.json',",
      '  },',
    ]);
  });

  it('changes the R3 firewall and the three historical tests by exactly the R4.1/R4.2 lines', () => {
    for (const [path, expected] of Object.entries(CLOSURE_EDITS)) {
      const diff = git('diff', '--unified=0', ...range(), '--', path).split('\n');
      expect(
        diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
        path,
      ).toEqual(expected.removed);
      expect(
        diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
        path,
      ).toEqual(expected.added);
    }
  });

  it('pins R3 at its own implementation commit, the commit R4 is based on', () => {
    expect(sourceOf(R3_FIREWALL)).toContain(
      `const REPAIR_TERMINAL_COMMIT: string | null = '${REPAIR_BASE_COMMIT}';`,
    );
  });

  it('keeps migrations 0001-0015 and every earlier docs/evaluation record byte-identical', () => {
    const touched = git(
      'diff',
      '--name-status',
      '--diff-filter=MDRT',
      ...range(),
      '--',
      'migrations',
      'docs/evaluation',
    )
      .split('\n')
      .filter((l) => l.length > 0);
    expect(touched).toEqual([]);
  });
});

describe('R4: migration 0016 is additive and grants no write', () => {
  const sql = sqlCodeOf(sourceOf(MIGRATION));

  it('alters, drops, updates, deletes and truncates nothing', () => {
    expect(sql).not.toMatch(/\b(ALTER|DROP|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE/i);
    expect(
      [...sql.matchAll(/CREATE\s+(TABLE|FUNCTION|TRIGGER|UNIQUE INDEX|INDEX)\s+(\w+)/gi)].map(
        (m) => m[2],
      ),
    ).toEqual([
      'subject_iso3166_alpha2_assigned',
      'subject_jurisdiction_claims',
      'subject_jurisdiction_claims_dedupe_uidx',
      'subject_jurisdiction_claims_subject_idx',
      'subject_jurisdiction_claims_append_only',
    ]);
  });

  it('grants exactly SELECT to nwf_readonly, and creates no role', () => {
    const grants = [...sql.matchAll(/\bGRANT\b([^;]*);/gi)].map((m) =>
      m[1]!.replace(/\s+/g, ' ').trim(),
    );
    expect(grants).toEqual(['SELECT ON subject_jurisdiction_claims TO nwf_readonly']);
    expect(sql).not.toMatch(/CREATE\s+ROLE|SECURITY\s+DEFINER/i);
  });

  it('declares no contact, permission, status, locale or market column', () => {
    const table = /CREATE TABLE subject_jurisdiction_claims \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? '';
    const columns = [...table.matchAll(/^\s{4}([a-z_]+)\s+(uuid|text|timestamptz)\b/gm)].map(
      (m) => m[1],
    );
    expect(columns).toEqual([
      'id',
      'subject_id',
      'claim_kind',
      'claimed_country',
      'claimed_legal_form',
      'source_type',
      'source_page_evidence_id',
      'source_website_claim_id',
      'source_url',
      'source_version_ref',
      'observed_at',
      'claim_basis',
      'recorded_by_actor_key',
      'created_at',
      'provenance_key',
      'value_key',
    ]);
    for (const column of columns) {
      expect(column).not.toMatch(
        /email|phone|contact|permi|consent|lawful|eligib|outreach|status|verified|market|locale|target_language|country_code/,
      );
    }
  });
});

describe('R4: subjectJurisdiction is pure, self-contained and unconnected', () => {
  it('imports only its own sibling module', () => {
    for (const file of MODULE_FILES) {
      const imports = [...codeOf(sourceOf(file)).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const specifier of imports) expect(specifier, file).toBe('./vocabulary.js');
    }
  });

  it('opens no socket, database, file or environment, and reads no clock or randomness', () => {
    for (const file of MODULE_FILES) {
      expect(codeOf(sourceOf(file)), file).not.toMatch(
        /process\.env|node:|\bpg\b|fetch\(|Date\.now|new Date\(|Math\.random|require\(|import\(/,
      );
    }
  });

  it('exports nothing contact-, permission- or verdict-shaped', () => {
    for (const file of MODULE_FILES) {
      expect(codeOf(sourceOf(file)), file).not.toMatch(
        /contact|permi|consent|lawful|eligib|outreach|qualif|verified|confirmed|relevant|mailto:|tel:/i,
      );
    }
  });

  it('has no production importer outside its own directory', () => {
    const importers = productionFiles().filter(
      (f) =>
        !f.startsWith(MODULE_DIR) &&
        /subjectJurisdiction/.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))),
    );
    expect(importers).toEqual([]);
  });

  it('is named by no production SQL or code outside the migration and itself', () => {
    const named = productionFiles().filter(
      (f) =>
        !f.startsWith(MODULE_DIR) &&
        /subject_jurisdiction_claims|subject_iso3166_alpha2_assigned/.test(
          codeOf(readFileSync(join(REPO_ROOT, f), 'utf8')),
        ),
    );
    expect(named).toEqual([]);
  });
});

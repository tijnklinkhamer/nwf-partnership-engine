/**
 * LANE L1 FIREWALL - subject research is EXECUTABLE, through the existing
 * engine, and nothing else moved (OWNER directive 2026-10-26, ADR 0025 s12).
 *
 * A NEW phase-isolation test for this slice, on the pattern of
 * `src/test/unit/orgunitRobotsOptionBRepairScope.test.ts`: every closed
 * phase keeps its own claim over its own range, and THIS file governs the
 * current change surface. Over L1_BASE_COMMIT..L1_TERMINAL_COMMIT (the
 * working tree while the terminal is open) it pins:
 *   - the change set is exactly the named files, and NO existing firewall
 *     file is edited;
 *   - every edit to a historical test is exactly its reviewed migration-0018
 *     acknowledgement (SHA-256 of its removed and added lines);
 *   - the orchestrator changed only by `planSubjectDiscovery` and a re-export,
 *     and the gateway, robots, authority, run guard, R6 planner, R9 export,
 *     classifier and migrations 0001-0017 are untouched;
 *   - `src/orgunits/subjectRun/` is two files, opens no socket, reads one
 *     environment marker only to REFUSE, writes nothing, issues only SELECTs,
 *     and reaches the network only through `runSubjectDiscovery`;
 *   - the capability has exactly two construction sites behind one unexported
 *     mint, and no constructor takes a verdict;
 *   - the CLI is an entry point on the research role with no web import, no
 *     robots authority, no batch flag and no injected dependency;
 *   - migration 0018 grants nothing and alters only what it names.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The Engine release candidate this lane branched from. */
const L1_BASE_COMMIT = 'fbe6a8c5ef1303b1a7524317b198d95c791f3050';

/** Open (null) until a separately authorised commit-closure step pins it. */
const L1_TERMINAL_COMMIT: string | null = null;

const MODULE_DIR = 'src/orgunits/subjectRun/';
const MODULE_FILES = [`${MODULE_DIR}admission.ts`, `${MODULE_DIR}execute.ts`];
const CLI_FILE = 'src/cli/commands/orgunitsSubjects.ts';
const MIGRATION = 'migrations/0018_subject_research_roots.sql';

const MODIFIED_PRODUCTION = ['src/cli/index.ts', 'src/orgunits/orchestrator/orchestrate.ts'];

/**
 * Each historical test L1 edits, and the SHA-256 of JSON {removed, added} of
 * its `git diff --unified=0` lines. Reviewed as:
 *   A1 frame               - 0018 acknowledged with ADR 0025 and the L1 owner record
 *   orgunitSchema          - migration list 0001..0018
 *   registry, P1a          - the newest migration is 0018
 *   R8 0017 safety         - the real runner applies 0017 AND 0018 to the historical corpus
 */
const ACKNOWLEDGED_EDITS: Readonly<Record<string, string>> = {
  'src/test/integration/discoverySubjectRegistry.test.ts':
    'e216a5408dd50dfafcd91e7e1281c6076ab3d373005b3653e4f88dca171295cb',
  'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts':
    '6d302aed39548447f5b1707d21fd85ea9b0a84dae236d5ef1b1f1d931fefa5b5',
  'src/test/integration/subjectResearchMigration0017R8.test.ts':
    '35d4830239e9afe468cc89c3e9976b1914eac7d10436c64697d585f47eaf0ece',
  'src/test/integration/orgunitSchema.test.ts':
    '468a1ee71d61db6cc5c0cfb11289ce09f49f93f88b1440b5abc37f759b83ac13',
  'src/test/unit/orgunitCorpus2DA1Frame.test.ts':
    '4ec160b8c13fd967476f5fa0312563a53bb127a5022239b8bbcfd50e2473350b',
};

const AUTHORISED_CHANGESET = [
  'M\tdocs/adr/0025-global-subject-research-admission.md',
  'A\tdocs/evaluation/REL_L1_SUBJECT_RESEARCH_OWNER_DIRECTIVE_RECORD_V1.json',
  `A\t${MIGRATION}`,
  `A\t${CLI_FILE}`,
  ...MODULE_FILES.map((f) => `A\t${f}`),
  ...MODIFIED_PRODUCTION.map((f) => `M\t${f}`),
  ...Object.keys(ACKNOWLEDGED_EDITS).map((f) => `M\t${f}`),
  'A\tsrc/test/firewall/relL1SubjectResearch.firewall.test.ts',
  'A\tsrc/test/integration/subjectResearchExecutionL1.test.ts',
  'A\tsrc/test/unit/subjectRunAdmissionL1.test.ts',
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
  commitExists(L1_BASE_COMMIT) && (L1_TERMINAL_COMMIT === null || commitExists(L1_TERMINAL_COMMIT));

const range = (): string[] =>
  L1_TERMINAL_COMMIT === null ? [L1_BASE_COMMIT] : [L1_BASE_COMMIT, L1_TERMINAL_COMMIT];

function changeset(): string[] {
  const tracked = git('diff', '--name-status', '--find-renames', ...range());
  const untracked =
    L1_TERMINAL_COMMIT === null
      ? git('ls-files', '--others', '--exclude-standard')
          .split('\n')
          .filter((l) => l.length > 0 && l !== 'node_modules')
          .map((l) => `A\t${l}`)
          .join('\n')
      : '';
  return [...new Set(`${tracked}\n${untracked}`.split('\n').filter((l) => l.length > 0))].sort();
}

function diffLines(path: string): { removed: string[]; added: string[] } {
  const diff = git('diff', '--unified=0', ...range(), '--', path).split('\n');
  return {
    removed: diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)),
    added: diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)),
  };
}

function sourceOf(path: string): string {
  if (L1_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return git('show', `${L1_TERMINAL_COMMIT}:${path}`);
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
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

const importsOf = (file: string): string[] =>
  [...new Set([...codeOf(sourceOf(file)).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]!))].sort();

const dynamicImportsOf = (file: string): string[] =>
  [...codeOf(sourceOf(file)).matchAll(/import\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]!).sort();

describe.skipIf(!rangeAvailable)('L1: the change set over its own range', () => {
  it('is exactly the named files', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits no existing firewall file, deletes nothing and renames nothing', () => {
    const lines = changeset();
    expect(lines.filter((l) => /^M\tsrc\/test\/firewall\//.test(l))).toEqual([]);
    expect(lines.filter((l) => /^[DR]/.test(l))).toEqual([]);
  });

  it('edits each historical test by exactly its reviewed L1 acknowledgement', () => {
    for (const [path, digest] of Object.entries(ACKNOWLEDGED_EDITS)) {
      const lines = diffLines(path);
      expect(createHash('sha256').update(JSON.stringify(lines), 'utf8').digest('hex'), path).toBe(
        digest,
      );
    }
  });

  it('changes the orchestrator only by planSubjectDiscovery, its import and one re-export', () => {
    const { removed } = diffLines('src/orgunits/orchestrator/orchestrate.ts');
    expect(removed).toEqual([
      "import { resolveRoot, type RootAuthorityRef } from '../web/authority.js';",
      '  const root = await resolveRoot(pool, ref);',
      '  await enforceSubjectRootResearchEligibility(pool, null, root, deps);',
    ]);
    const orchestrate = codeOf(sourceOf('src/orgunits/orchestrator/orchestrate.ts'));
    expect(orchestrate).toMatch(
      /export async function planSubjectDiscovery\([\s\S]*?const root = await resolveRoot\(pool, \{ kind: 'SUBJECT_ADMISSION', admissionId \}\);\s*await enforceSubjectRootResearchEligibility\(pool, null, root, deps\);\s*return root;\s*\}/,
    );
    expect(orchestrate).toMatch(
      /export \{ SubjectRootRefusal \} from '\.\.\/subjectAdmission\/runGuard\.js';/,
    );
  });

  it('leaves the gateway, robots, authority, run guard, R6, R9, classifier and migrations 0001-0017 untouched', () => {
    const touched = git(
      'diff',
      '--name-status',
      ...range(),
      '--',
      'src/orgunits/web',
      'src/orgunits/subjectAdmission',
      'src/orgunits/subjectResearch',
      'src/orgunits/subjectResearchEvidence',
      'src/orgunits/subjectRegistry',
      'src/orgunits/subjectReview',
      'src/orgunits/identity',
      'src/orgunits/classify',
      'src/orgunits/signals',
      'src/orgunits/orchestrator/rootRunner.ts',
      'src/orgunits/orchestrator/run.ts',
      'src/cli/commands/discover.ts',
      'migrations',
    )
      .split('\n')
      .filter((l) => l.length > 0);
    expect(touched).toEqual(L1_TERMINAL_COMMIT === null ? [] : [`A\t${MIGRATION}`]);
    if (L1_TERMINAL_COMMIT === null) {
      expect(changeset()).toContain(`A\t${MIGRATION}`);
    }
  });
});

describe('L1: subjectRun is narrow, socket-free and reaches the network only through the orchestrator', () => {
  it('is exactly the two reviewed files', () => {
    expect(productionFiles().filter((f) => f.startsWith(MODULE_DIR))).toEqual(MODULE_FILES);
  });

  it('imports only what each file is reviewed to', () => {
    expect(importsOf(`${MODULE_DIR}admission.ts`)).toEqual(
      [
        '../orchestrator/orchestrate.js',
        '../orchestrator/rootRunner.js',
        '../web/authority.js',
        'pg',
      ].sort(),
    );
    expect(importsOf(`${MODULE_DIR}execute.ts`)).toEqual(
      [
        '../orchestrator/orchestrate.js',
        '../orchestrator/rootRunner.js',
        '../web/authority.js',
        './admission.js',
        'pg',
      ].sort(),
    );
    for (const file of MODULE_FILES) {
      const code = codeOf(sourceOf(file));
      // Only types and the refusal class from web/authority: never a resolver call.
      expect(code, file).not.toMatch(/\bresolveRoot\s*\(|\bresolveRun\s*\(/);
      expect(dynamicImportsOf(file), file).toEqual([]);
    }
  });

  it('opens no socket, calls no model, names no robots file and never touches the gateway itself', () => {
    for (const file of MODULE_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\bfetch\s*\(|node:(net|tls|http|https|dns|fs|child_process)|executeWebAttempt|authoriseAndFetchPage|runRootAcquisition|robots\.txt|claude-agent-sdk|anthropic|apollo/i,
      );
      expect(code, file).not.toMatch(
        /subjectAdmission\/|subjectResearchEvidence|cand:|contact|consent|outreach|qualif/i,
      );
    }
  });

  it('reads one environment marker, in the capability seam, only to REFUSE outside vitest', () => {
    for (const file of MODULE_FILES) {
      const reads = codeOf(sourceOf(file)).match(/process\.env/g) ?? [];
      expect(reads.length, file).toBe(file.endsWith('admission.ts') ? 1 : 0);
    }
    expect(codeOf(sourceOf(`${MODULE_DIR}admission.ts`))).toMatch(
      /static forVitestUnverified\(fields: AdmissionFields\): VerifiedSubjectAdmission \{\s*if \(process\.env\['VITEST'\] !== 'true'\) \{\s*throw new Error\(/,
    );
  });

  it('writes nothing: every statement is a SELECT', () => {
    for (const file of MODULE_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|GRANT|LOCK)\b\s/,
      );
      const statements = [...code.matchAll(/`(\s*SELECT[\s\S]*?)`/g)].map((m) => m[1]!);
      expect(statements.length, file).toBe(1);
      for (const s of statements) {
        expect(s).not.toMatch(/discovery_subject|subject_review_attestations|subject_jurisdiction/);
      }
    }
  });

  it('starts runs only through runSubjectDiscovery, after a brand check', () => {
    const code = codeOf(sourceOf(`${MODULE_DIR}execute.ts`));
    expect([...code.matchAll(/runSubjectDiscovery\(/g)]).toHaveLength(1);
    expect(code).toMatch(
      /if \(!VerifiedSubjectAdmission\.isVerified\(admission\)\) \{\s*throw new SubjectExecutionRefusal\('ADMISSION_CAPABILITY_UNVERIFIED'\);\s*\}\s*const planned = await planSubjectDiscovery\(pool, admission\.admissionId, deps\);\s*if \(planned\.subjectAdmission\?\.subjectId !== admission\.subjectId\) \{\s*throw new SubjectExecutionRefusal\('ADMISSION_SUBJECT_MISMATCH'\);\s*\}\s*const result = await runSubjectDiscovery\(/,
    );
    expect(code).not.toMatch(/startRun|startSubjectRun|completeRun/);
  });

  it('constructs the capability in exactly two places, behind one unexported mint, from no caller verdict', () => {
    const code = codeOf(sourceOf(`${MODULE_DIR}admission.ts`));
    expect([...code.matchAll(/new VerifiedSubjectAdmission\(/g)]).toHaveLength(2);
    expect(code).toMatch(/private constructor\(mint: symbol, /);
    expect(code).toMatch(/if \(mint !== MINT\) \{\s*throw new Error\(/);
    expect(code).toMatch(/^const MINT: unique symbol = Symbol\(/m);
    expect(code).not.toMatch(/export\s+(const|\{[^}]*\bMINT\b)/);
    expect([...code.matchAll(/static (\w+)\(/g)].map((m) => m[1]).sort()).toEqual([
      'forVitestUnverified',
      'fromDatabase',
      'isVerified',
    ]);
    expect([...code.matchAll(/VerifiedSubjectAdmission\.fromDatabase\(MINT,/g)]).toHaveLength(1);
    expect(code).not.toMatch(/'(ALLOWED|GRANTED|PERMITTED|ELIGIBLE)'/);
  });

  it('is imported in production only by the CLI command', () => {
    const importers = productionFiles()
      .filter((f) => !f.startsWith(MODULE_DIR))
      .filter((f) =>
        /orgunits\/subjectRun\//.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))),
      );
    expect(importers).toEqual([CLI_FILE]);
  });
});

describe('L1: the CLI is an entry point, not a network owner', () => {
  const cli = () => codeOf(sourceOf(CLI_FILE));

  it('never imports orgunits/web, opens no socket and calls no fetch', () => {
    expect(cli()).not.toContain('orgunits/web');
    expect(cli()).not.toMatch(/from\s+['"]node:(net|tls|http|https|dns)['"]|\bfetch\s*\(/);
  });

  it('reaches execution only through subjectRun/, and imports nothing else that runs research', () => {
    expect([...importsOf(CLI_FILE), ...dynamicImportsOf(CLI_FILE)].sort()).toEqual(
      [
        '../../db/client.js',
        '../../logging/log.js',
        '../../orgunits/orchestrator/rootRunner.js',
        '../../orgunits/subjectRun/admission.js',
        '../../orgunits/subjectRun/execute.js',
      ].sort(),
    );
    expect(cli()).toMatch(
      /import type \{ RootRunnerDeps \} from '\.\.\/\.\.\/orgunits\/orchestrator\/rootRunner\.js';/,
    );
  });

  it('manufactures no robots authorisation and no admission, and has no batch or bypass flag', () => {
    const code = cli();
    for (const banned of [
      'RobotsAuthorisation',
      'executeWebAttempt',
      'forVitestUnverified',
      'fromDatabase',
      'recordSubjectResearchAdmission',
      'skipRobots',
      'ignoreRobots',
      'bypassRobots',
      '--all',
      'allSubjects',
      'scanDatabase',
    ]) {
      expect(code, banned).not.toContain(banned);
    }
    expect(code).toMatch(/if \(!options\.execute\) \{/);
  });

  it('uses the research role only', () => {
    const code = cli();
    expect(code).toMatch(/withPool\(\s*'research'/);
    expect(code).not.toMatch(/withPool\(\s*'(admin|ingest|readonly|classifier)'/);
  });

  it('is called by index.ts with no injected dependency', () => {
    const index = codeOf(sourceOf('src/cli/index.ts'));
    const at = index.indexOf('runOrgunitsSubjectsResearch({');
    expect(at).toBeGreaterThan(0);
    expect(index.indexOf('runOrgunitsSubjectsResearch(', at + 1)).toBe(-1);
    const call = index.slice(at, index.indexOf('\n    });', at));
    expect(call).toMatch(/json: values\.json === true,$/);
    expect(call).not.toMatch(/transport|clock|loadCohortRegistry|deps|\}, \{/);
  });
});

describe('L1: migration 0018 is narrow', () => {
  const sql = sourceOf(MIGRATION).replace(/--.*$/gm, '');

  it('grants nothing, creates no role, function, trigger, view or table, and drops nothing', () => {
    expect(sql).not.toMatch(
      /\b(GRANT|REVOKE|CREATE\s+(ROLE|FUNCTION|TRIGGER|VIEW|TABLE)|DROP|SECURITY DEFINER|UPDATE|DELETE|INSERT)\b/i,
    );
  });

  it('alters only the candidate table, and indexes only the run table', () => {
    const altered = [...sql.matchAll(/ALTER TABLE\s+(\w+)/g)].map((m) => m[1]);
    expect([...new Set(altered)]).toEqual(['orgunit_page_candidates']);
    const indexed = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX\s+\w+\s+ON\s+(\w+)/g)].map(
      (m) => m[1],
    );
    expect(indexed).toEqual(['orgunit_research_runs']);
    expect(sql).toMatch(
      /FOREIGN KEY \(run_id, run_root_scope\) REFERENCES orgunit_research_runs \(id, root_scope\)/,
    );
    expect(sql).toMatch(/GENERATED ALWAYS AS/);
  });
});

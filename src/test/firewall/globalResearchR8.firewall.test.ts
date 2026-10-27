/**
 * GLOBAL R8 FIREWALL - a discovery subject can be RESEARCHED under an OWNER
 * admission, through the existing engine, and nothing else moved.
 *
 * Pins, over R8_BASE_COMMIT..R8_TERMINAL_COMMIT (the working tree while the
 * terminal is open):
 *   - the change set is exactly the named files;
 *   - every edit to a historical test is exactly the R8 acknowledgement it
 *     was reviewed as (SHA-256 of its removed and added lines);
 *   - the ECHE research path, the classifier, the cohort pins, migrations
 *     0001-0016, every earlier docs record and ADR, the CLI, the R6 planner
 *     and every closed Track B namespace are byte-identical; the gateway
 *     changed by ONE line and `startRun` not at all;
 *   - `src/orgunits/subjectAdmission/` imports only what it is reviewed to,
 *     opens no socket, reads one environment marker only to REFUSE, writes
 *     only its own two tables, and is reached by research only through the
 *     run guard;
 *   - migration 0017 grants only SELECT, creates no role or definer function,
 *     and regenerates root_key with the original two branches first.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EVALUATION_COHORT_ARTIFACT_PINS,
  loadEvaluationCohortRegistry,
} from '../../orgunits/classify/evaluationCohortGuard.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** The Global R6 pin commit (`fea2383`): the R8 base. */
const R8_BASE_COMMIT = 'fea23839741e0329842d276f53032fcb52f4b53c';

/** Open (null) until a separately authorised commit-closure phase pins it. */
const R8_TERMINAL_COMMIT: string | null = 'd0c76a80883d6f754163ad094391e3124cf6a31e';

const MODULE_DIR = 'src/orgunits/subjectAdmission/';
const MODULE_FILES = [
  `${MODULE_DIR}isolation.ts`,
  `${MODULE_DIR}policy.ts`,
  `${MODULE_DIR}record.ts`,
  `${MODULE_DIR}registryDigest.ts`,
  `${MODULE_DIR}runGuard.ts`,
];
const MIGRATION = 'migrations/0017_subject_research_admission.sql';

const MODIFIED_PRODUCTION = [
  'src/orgunits/orchestrator/orchestrate.ts',
  'src/orgunits/orchestrator/rootRunner.ts',
  'src/orgunits/orchestrator/run.ts',
  'src/orgunits/web/authority.ts',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/observations.ts',
];

/**
 * Each historical test R8 edits, and the SHA-256 of JSON {removed, added} of
 * its `git diff --unified=0` lines. Reviewed as:
 *   phase2b                 - research may read the admission, revocation and fingerprint view (0017 only, SELECT only)
 *   B2.2 registry           - exact-path exception: policy.ts (read model, effective projection), record.ts (loader + clock)
 *   B2.3 review             - the same two files, and only their read-only review / trust-set forms
 *   B3.0 cohort guard       - record.ts and runGuard.ts declare the cohort seam with the committed default
 *   B2.5-V1                 - policy.ts is the one further B2.1 importer
 *   discoverySubjectRegistry, P1a - the newest migration is 0017
 *   orgunitGrants           - the three read-only subject-root sources
 *   orgunitSchema           - migration list 0001..0017
 *   subjectResearchR6       - blocker 2 is LIFTED for an OWNER admission only, never for R6's subject_claim kind
 *   A1 frame                - 0017 acknowledged with its ADR and OWNER brief record
 */
const ACKNOWLEDGED_EDITS: Readonly<Record<string, string>> = {
  'src/test/firewall/phase2b.firewall.test.ts':
    'e1f53cb6c72897eb61332015ee2d7be87c91c305cbe3438934798449d72f060e',
  'src/test/firewall/phase2bDiscoverySubjectRegistry.firewall.test.ts':
    '01e146b05ac78307b98cdc81cf363ce6728809f94878dd8cfe50ac3647d60353',
  'src/test/firewall/phase2bOwnerAttestedReview.firewall.test.ts':
    '01ea2bfeb961fd976eaadd9da40805c319c78dbdfc1cf8f7a6b159161da43cfd',
  'src/test/firewall/phase2bResearchCohortGuard.firewall.test.ts':
    '496f3cf50e1029a7f4491f943103822ff48069e01472044e617c6c8f81a398c8',
  'src/test/firewall/phase2bSubjectValidationV1.firewall.test.ts':
    '4a03d9a1b96b822ec25407293de37bcf3872272c2d7c540a1c0655caac0ac4d5',
  'src/test/integration/discoverySubjectRegistry.test.ts':
    '00016eefa37c36d08fe0fe01c876c688404539a805410478796632be1f39b420',
  'src/test/integration/discoverySubjectSnapshotReadB25P1a.test.ts':
    'd7b9f3f693b025c4fbcf218938e2393662e34df568d455f507ea471563d4e61b',
  'src/test/integration/orgunitGrants.test.ts':
    'aae3a2f1ba4829c69061e34833571e1e676f5ff2603f439236af294c3adb4bb5',
  'src/test/integration/orgunitSchema.test.ts':
    'bd7933bb21e1e3ed08c83da3666db891d93e32cb41b03091db8822e338f064dc',
  'src/test/integration/subjectResearchR6.test.ts':
    '50287823b6940d3751eb9ce72263bd6d55433c9cd0cbe8ca49f90ee52f33a0c6',
  'src/test/unit/orgunitCorpus2DA1Frame.test.ts':
    '2e6ccf53f6e6388b24c1ceb71bbccc7aab10c43aef68a50b6d3e15fda3832129',
};

const AUTHORISED_CHANGESET = [
  'A\tdocs/adr/0025-global-subject-research-admission.md',
  'A\tdocs/evaluation/GLOBAL_R8_OWNER_BRIEF_RECORD_V1.json',
  `A\t${MIGRATION}`,
  ...MODULE_FILES.map((f) => `A\t${f}`),
  ...MODIFIED_PRODUCTION.map((f) => `M\t${f}`),
  ...Object.keys(ACKNOWLEDGED_EDITS).map((f) => `M\t${f}`),
  'A\tsrc/test/firewall/globalResearchR8.firewall.test.ts',
  'A\tsrc/test/integration/subjectResearchExecutionR8.test.ts',
  'A\tsrc/test/integration/subjectResearchMigration0017R8.test.ts',
  'A\tsrc/test/unit/subjectAdmissionPolicyR8.test.ts',
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
  commitExists(R8_BASE_COMMIT) && (R8_TERMINAL_COMMIT === null || commitExists(R8_TERMINAL_COMMIT));

const range = (): string[] =>
  R8_TERMINAL_COMMIT === null ? [R8_BASE_COMMIT] : [R8_BASE_COMMIT, R8_TERMINAL_COMMIT];

function changeset(): string[] {
  const tracked = git('diff', '--name-status', '--find-renames', ...range());
  const untracked =
    R8_TERMINAL_COMMIT === null
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
  if (R8_TERMINAL_COMMIT === null) return readFileSync(join(REPO_ROOT, path), 'utf8');
  return git('show', `${R8_TERMINAL_COMMIT}:${path}`);
}

function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sqlCodeOf(source: string): string {
  return source.replace(/--.*$/gm, '');
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

describe.skipIf(!rangeAvailable)('R8: the change set over its own range', () => {
  it('is exactly the named files', () => {
    expect(changeset()).toEqual(AUTHORISED_CHANGESET);
  });

  it('edits each historical test by exactly its reviewed R8 acknowledgement', () => {
    for (const [path, digest] of Object.entries(ACKNOWLEDGED_EDITS)) {
      const lines = diffLines(path);
      expect(createHash('sha256').update(JSON.stringify(lines), 'utf8').digest('hex'), path).toBe(
        digest,
      );
    }
  });

  it('changes the gateway by ONE added line, and startRun not at all', () => {
    expect(diffLines('src/orgunits/web/gateway.ts')).toEqual({
      removed: [],
      added: ['      rootSubjectAdmissionId: context.root.subjectAdmissionId,'],
    });
    const run = diffLines('src/orgunits/orchestrator/run.ts');
    expect(run.removed).toEqual([]);
    const before = git('show', `${R8_BASE_COMMIT}:src/orgunits/orchestrator/run.ts`);
    const startRun = /export async function startRun[\s\S]*?\n}\n/.exec(before)![0];
    expect(sourceOf('src/orgunits/orchestrator/run.ts')).toContain(startRun);
  });

  it('keeps the ECHE branch of runRootAcquisition calling the B3.0 guard exactly as before', () => {
    const { removed } = diffLines('src/orgunits/orchestrator/rootRunner.ts');
    expect(removed).toEqual([
      '  await enforceRootResearchEligibility(pool, runId, resolved, deps);',
    ]);
    expect(codeOf(sourceOf('src/orgunits/orchestrator/rootRunner.ts'))).toMatch(
      /if \(resolved\.subjectAdmission !== null\) \{\s*await enforceSubjectRootResearchEligibility\(pool, runId, resolved, deps\);\s*\} else \{\s*await enforceRootResearchEligibility\(pool, runId, resolved, deps\);\s*\}/,
    );
  });

  it('leaves the classifier, cohort pins, CLI, R6, Track B, migrations 0001-0016 and every earlier record byte-identical', () => {
    const touched = git(
      'diff',
      '--name-status',
      ...range(),
      '--',
      'src/orgunits/classify',
      'src/orgunits/orchestrator/researchCohortGuard.ts',
      'src/orgunits/web/robots.ts',
      'src/orgunits/web/robotsAuthority.ts',
      'src/orgunits/web/policy.ts',
      'src/orgunits/signals',
      'src/orgunits/subjectResearch',
      'src/orgunits/identity',
      'src/orgunits/subjectRegistry',
      'src/orgunits/subjectReview',
      'src/orgunits/subjectHandoff',
      'src/orgunits/subjectSnapshot',
      'src/orgunits/subjectSnapshotRead',
      'src/orgunits/subjectJurisdiction',
      'src/orgunits/subjectReadProvenance',
      'src/cli',
      'src/test/harness',
      'src/test/fixtures',
      ...EVALUATION_COHORT_ARTIFACT_PINS.map((p) => p.path),
    )
      .split('\n')
      .filter((l) => l.length > 0);
    expect(touched).toEqual([]);
    const docsAndMigrations = git('diff', '--name-status', ...range(), '--', 'migrations', 'docs')
      .split('\n')
      .filter((l) => l.length > 0 && !l.startsWith('A\t'));
    expect(docsAndMigrations).toEqual([]);
  });

  it('the committed cohort pins still verify', () => {
    expect(loadEvaluationCohortRegistry().ok).toBe(true);
  });
});

describe('R8: subjectAdmission is narrow, socket-free and reached only through the run guard', () => {
  it('is exactly the five reviewed files', () => {
    expect(productionFiles().filter((f) => f.startsWith(MODULE_DIR))).toEqual(MODULE_FILES);
  });

  it('imports only what each file is reviewed to', () => {
    expect(importsOf(`${MODULE_DIR}policy.ts`)).toEqual(
      [
        '../classify/evaluationCohortGuard.js',
        '../identity/structuralParent.js',
        '../identity/vocabulary.js',
        '../subjectRegistry/readModel.js',
        '../subjectRegistry/reviewAttestation.js',
        '../subjectReview/trust.js',
        '../web/authority.js',
        '../web/hostPolicy.js',
        '../web/url.js',
        './registryDigest.js',
      ].sort(),
    );
    expect(importsOf(`${MODULE_DIR}registryDigest.ts`)).toEqual([
      '../classify/evaluationCohortGuard.js',
      'node:crypto',
    ]);
    expect(importsOf(`${MODULE_DIR}isolation.ts`)).toEqual([
      '../../website/parse.js',
      '../web/observations.js',
    ]);
    expect(importsOf(`${MODULE_DIR}runGuard.ts`)).toEqual(
      [
        '../classify/evaluationCohortGuard.js',
        '../web/authority.js',
        './isolation.js',
        './registryDigest.js',
        'pg',
      ].sort(),
    );
    expect(importsOf(`${MODULE_DIR}record.ts`)).toEqual(
      [
        '../classify/evaluationCohortGuard.js',
        '../subjectRegistry/store.js',
        '../subjectReview/trust.js',
        './isolation.js',
        './policy.js',
        'pg',
      ].sort(),
    );
  });

  it('opens no socket, calls no model, names no robots file and requests nothing', () => {
    for (const file of MODULE_FILES) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(
        /\bfetch\s*\(|node:(net|tls|http|https|dns|fs|child_process)|executeWebAttempt|authoriseAndFetchPage|robots\.txt|claude-agent-sdk|anthropic|apollo/i,
      );
      expect(code, file).not.toMatch(/cand:|contact|consent|lawful|outreach|qualif/i);
    }
  });

  it('keeps the policy and the digest PURE', () => {
    for (const file of [`${MODULE_DIR}policy.ts`, `${MODULE_DIR}registryDigest.ts`]) {
      const code = codeOf(sourceOf(file));
      expect(code, file).not.toMatch(/from 'pg'|process\.|Date\.now|new Date\(|Math\.random/);
      expect(code, file).not.toMatch(/\b(SELECT|INSERT|UPDATE|DELETE)\b\s/);
    }
  });

  it('reads one environment marker, in the run guard, only to REFUSE a TEST_ONLY admission', () => {
    for (const file of MODULE_FILES) {
      const reads = codeOf(sourceOf(file)).match(/process\.env/g) ?? [];
      expect(reads.length, file).toBe(file.endsWith('runGuard.ts') ? 1 : 0);
    }
    expect(codeOf(sourceOf(`${MODULE_DIR}runGuard.ts`))).toMatch(
      /if \(admission\.identityAuthorityScope !== 'OPERATIONAL' && process\.env\['VITEST'\] !== 'true'\) \{\s*throw new SubjectRootRefusal\('SUBJECT_ROOT_TEST_ONLY_OUTSIDE_TEST'\);/,
    );
  });

  it('writes only its own two tables, and only on the owner path', () => {
    for (const file of MODULE_FILES) {
      const code = codeOf(sourceOf(file));
      const writes = [...code.matchAll(/\b(INSERT INTO|UPDATE|DELETE FROM|TRUNCATE)\s+(\w+)/g)].map(
        (m) => `${m[1]} ${m[2]}`,
      );
      expect(writes, file).toEqual(
        file.endsWith('record.ts')
          ? [
              'INSERT INTO subject_research_admissions',
              'INSERT INTO subject_research_admission_revocations',
            ]
          : [],
      );
    }
  });

  it('is reached by production code only through the run guard, from the root runner and orchestrator', () => {
    const importers = productionFiles()
      .filter((f) => !f.startsWith(MODULE_DIR))
      .filter((f) => /subjectAdmission\//.test(codeOf(readFileSync(join(REPO_ROOT, f), 'utf8'))));
    // WW E-W (exact-path widening, ADR 0030 s4): the campaign research stage
    // binds a CAMPAIGN admission to the protected-registry digest, importing
    // ONLY the pure digest - never the policy, the recorder or the guard.
    const WW_EW_RESEARCH = 'src/orgunits/acquisitionWiring/research.ts';
    expect(importers).toEqual([
      WW_EW_RESEARCH,
      'src/orgunits/orchestrator/orchestrate.ts',
      'src/orgunits/orchestrator/rootRunner.ts',
    ]);
    for (const file of importers) {
      // The WW E-W file postdates R8's pinned tree: read it from the working tree.
      const imports =
        file === WW_EW_RESEARCH
          ? [
              ...codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')).matchAll(/from\s+'([^']+)'/g),
            ].map((m) => m[1]!)
          : importsOf(file);
      expect(
        imports.filter((i) => i.includes('subjectAdmission/')),
        file,
      ).toEqual(
        file === WW_EW_RESEARCH
          ? ['../subjectAdmission/registryDigest.js']
          : ['../subjectAdmission/runGuard.js'],
      );
    }
  });

  it('adds no CLI and no batch form: runSubjectDiscovery takes one admission id', () => {
    for (const file of productionFiles().filter((f) => f.startsWith('src/cli/'))) {
      expect(codeOf(readFileSync(join(REPO_ROOT, file), 'utf8')), file).not.toMatch(
        /runSubjectDiscovery|subjectAdmission|SUBJECT_ADMISSION/,
      );
    }
    const orchestrate = codeOf(sourceOf('src/orgunits/orchestrator/orchestrate.ts'));
    expect(orchestrate).toMatch(
      /export interface RunSubjectDiscoveryInput \{\s*admissionId: string;\s*networkVantage: string;\s*\}/,
    );
  });
});

describe('R8: migration 0017 is narrow', () => {
  const sql = sqlCodeOf(sourceOf(MIGRATION));

  it('grants only SELECT, to research and audit only, and creates no role or definer function', () => {
    const grants = [...sql.matchAll(/GRANT\s+([\s\S]*?)\s+ON\s+([\s\S]*?)\s+TO\s+(\w+)\s*;/g)];
    expect(grants.length).toBeGreaterThan(0);
    for (const [, privileges, , grantee] of grants) {
      expect(privileges!.trim()).toBe('SELECT');
      expect(['nwf_research', 'nwf_readonly']).toContain(grantee);
    }
    expect(sql).not.toMatch(/CREATE ROLE|ALTER ROLE|SECURITY DEFINER|security_invoker|\bjsonb?\b/i);
    // Identifiers only: COMMENT ON prose (string literals) may explain what is absent.
    const identifiers = sql.replace(/'(?:[^']|'')*'/g, "''");
    expect(identifiers).not.toMatch(
      /\b(contact|email|phone|country|legal_form|score|eligib|verified)\w*\b/i,
    );
  });

  it('alters only the fetch, page-evidence and run tables, and drops only what the root_key rebuild needs', () => {
    const altered = [...sql.matchAll(/ALTER TABLE\s+(\w+)/g)].map((m) => m[1]);
    expect([...new Set(altered)].sort()).toEqual([
      'orgunit_fetch_observations',
      'orgunit_page_evidence',
      'orgunit_research_runs',
    ]);
    const drops = [...sql.matchAll(/\bDROP\s+(\w+(?:\s+\w+)?)\s+(\w+)/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(drops.sort()).toEqual(
      [
        'CONSTRAINT orgunit_fetch_observations_root_xor_chk',
        'CONSTRAINT orgunit_page_evidence_root_fk',
        'COLUMN root_key',
        'INDEX orgunit_fetch_observations_dedupe_uidx',
        'INDEX orgunit_fetch_observations_id_root_key_uidx',
        'NOT NULL',
      ].sort(),
    );
  });

  it('regenerates root_key with the original two branches first, unchanged and in order', () => {
    const original = sqlCodeOf(sourceOf('migrations/0007_orgunit_research_foundation.sql'));
    const branches = (text: string) =>
      [...text.matchAll(/WHEN (root_\w+) IS NOT NULL\s+THEN '(\w+):' \|\| \1::text/g)].map(
        (m) => `${m[1]}->${m[2]}`,
      );
    expect(branches(original)).toEqual([
      'root_website_claim_id->claim',
      'root_promotion_id->promotion',
    ]);
    expect(branches(sql)).toEqual([
      'root_website_claim_id->claim',
      'root_promotion_id->promotion',
      'root_subject_admission_id->subject_admission',
    ]);
    expect(sql).toMatch(/root_key text\s+GENERATED ALWAYS AS/);
  });
});

/**
 * R3P3-A FIREWALL - subject-rooted classification (ADR 0031, migration 0030,
 * OWNER decision 2026-10-29) is ONE narrow capability:
 *
 *   - four modules under `src/orgunits/subjectClassify/` and one CLI entry
 *     point; no socket, no gateway, no SDK, no provider construction outside
 *     the CLI's dynamic import of the landed Claude-Max-only wiring;
 *   - migration 0030 grants nothing, creates nothing, alters only the
 *     classifier call table and keeps every 0009/0011 CHECK;
 *   - dry run by default; exactly one admission and one run per invocation;
 *   - the frozen classifier is not edited by it and does not reach it.
 *
 * Pinned by path and content, never by commit (the lead cherry-picks).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  REPO_ROOT,
  codeOf,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

const NS = 'src/orgunits/subjectClassify/';
const CLI = 'src/cli/commands/subjectClassify.ts';
const MIGRATION = 'migrations/0030_subject_rooted_classification.sql';
const FILES = ['authority.ts', 'cohort.ts', 'prompt.ts', 'run.ts'].map((f) => `${NS}${f}`);

const code = (file: string) => codeOf(readCurrent(file));
const sqlCode = (sql: string) => sql.replace(/--.*$/gm, '');

describe('R3P3-A: the subjectClassify namespace is exactly four modules', () => {
  it('holds exactly authority, cohort, prompt and run', () => {
    expect(readdirSync(join(REPO_ROOT, NS)).sort()).toEqual(
      ['authority.ts', 'cohort.ts', 'prompt.ts', 'run.ts'].sort(),
    );
  });

  it('opens no socket, reads no file, spawns nothing and loads no SDK', () => {
    for (const file of [...FILES, CLI]) {
      const source = code(file);
      expect(source, file).not.toMatch(/node:(net|tls|http|https|dns|fs|child_process)/);
      expect(source, file).not.toMatch(/\bfetch\s*\(|claude-agent-sdk|@anthropic-ai/);
      expect(
        specifiers(source).some((s) => /orgunits\/web\/|^\.\.\/web\//.test(s)),
        file,
      ).toBe(false);
      for (const segment of ['sourceDiscovery', 'orchestrator', 'acquisition', 'subjectRun']) {
        expect(
          specifiers(source).some((s) => new RegExp(`(^|/)${segment}(/|$)`).test(s)),
          `${file} reaches ${segment}`,
        ).toBe(false);
      }
    }
  });

  it('constructs no provider: only the CLI shell imports the landed Max-only wiring, dynamically', () => {
    for (const file of FILES) {
      expect(code(file), file).not.toMatch(
        /ClaudeMaxAgentProvider|createProductionClassifierProvider|classifyProvider|new\s+\w*Provider\s*\(/,
      );
    }
    const cli = code(CLI);
    expect(cli.match(/import\('\.\/classifyProvider\.js'\)/g)).toHaveLength(1);
    expect(cli).not.toMatch(/from\s+'\.\/classifyProvider\.js'/);
    expect(cli).toMatch(/withPool\('research'/);
    expect(cli).toMatch(/withPool\('classifier'/);
    expect(cli).not.toMatch(/withPool\('(admin|ingest|readonly)'/);
  });

  it('reads the environment only for the vitest TEST_ONLY gate', () => {
    for (const file of FILES) {
      const reads = code(file).match(/process\.env(\.\w+|\[['"]\w+['"]\])?/g) ?? [];
      expect(reads, file).toEqual(file.endsWith('authority.ts') ? ["process.env['VITEST']"] : []);
    }
  });

  it('cohort.ts is pure: no database, no clock, no randomness', () => {
    const cohort = code(`${NS}cohort.ts`);
    expect(specifiers(cohort)).toEqual(['../classify/evaluationCohortGuard.js']);
    expect(cohort).toMatch(/import type \{ EvaluationCohortRegistry \}/);
    expect(cohort).not.toMatch(/Date\.now|Math\.random|\.query\(/);
  });

  it('writes only classifier rows: one call INSERT naming the admission, never an ECHE key', () => {
    const run = code(`${NS}run.ts`);
    expect(run).not.toMatch(/\b(UPDATE|DELETE|TRUNCATE|ALTER|GRANT)\b/);
    const inserts = [...run.matchAll(/INSERT INTO (\w+)/g)].map((m) => m[1]);
    expect(inserts).toEqual(['orgunit_classifier_calls']);
    expect(run).toMatch(/VALUES \(\$1, NULL, NULL, NULL, \$2,/);
    expect(run).not.toMatch(/repairPolicy|runRepairRound|repairOfCallId/);
    for (const file of FILES.filter((f) => !f.endsWith('run.ts'))) {
      expect(code(file), file).not.toMatch(/\bINSERT\b/);
    }
  });

  it('declares its own prompt version and never the production one', () => {
    const prompt = code(`${NS}prompt.ts`);
    expect(prompt).toContain(
      "ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION = 'orgunit-subject-classifier-prompt-v1'",
    );
    for (const file of [...FILES, CLI]) {
      expect(code(file), file).not.toMatch(/orgunit-classifier-prompt-v\d/);
    }
    expect(readCurrent('src/orgunits/classify/prompt.ts')).toContain('ECHE row key');
  });
});

describe('R3P3-A: the classifier stays frozen and separate', () => {
  it('no classify/ file reaches subjectClassify or the subject CLI', () => {
    for (const file of productionFiles().filter((f) => f.startsWith('src/orgunits/classify/'))) {
      expect(readCurrent(file), file).not.toMatch(/subjectClassify\b|commands\/subjectClassify/);
    }
  });

  it('only the CLI and its own namespace reach subjectClassify', () => {
    const importers = productionFiles()
      .filter((f) => !f.startsWith(NS))
      .filter((f) => specifiers(code(f)).some((s) => /(^|\/)subjectClassify\//.test(s)));
    expect(importers).toEqual([CLI]);
    const index = code('src/cli/index.ts');
    expect(index.match(/runSubjectClassifyCli\(/g)).toHaveLength(1);
    expect(index).toContain(
      "if (argv[0] === 'orgunits' && argv[1] === 'subjects' && argv[2] === 'classify') {\n    return runSubjectClassifyCli(argv.slice(3));\n  }",
    );
  });
});

describe('R3P3-A: the CLI is one admission, one run, dry run by default', () => {
  const cli = code(CLI);

  it('defaults to a dry run and has no scope escape', () => {
    expect(cli).toContain("execute: { type: 'boolean', default: false }");
    for (const banned of ['--all', "'all'", 'latest', 'sweep', '--subject-id']) {
      expect(cli, banned).not.toContain(banned);
    }
    expect(cli).toMatch(/strict: true/);
  });

  it('runs the pure Max-only preflight and the cohort rule before any phase-B read', () => {
    const preflight = cli.indexOf('runClassifierPreflight({');
    const cohort = cli.indexOf('evaluateSubjectCohortMembership(');
    const planB = cli.indexOf('planSubjectClassification(');
    const provider = cli.indexOf('deps.createProvider()');
    expect(preflight).toBeGreaterThan(0);
    expect(cohort).toBeGreaterThan(preflight);
    expect(planB).toBeGreaterThan(cohort);
    expect(provider).toBeGreaterThan(planB);
    expect(cli).toContain(
      'plan.requiresProvider ? await deps.createProvider() : PROVIDER_NOT_REQUIRED',
    );
  });
});

describe('R3P3-A: migration 0030 is narrow', () => {
  const sql = sqlCode(readCurrent(MIGRATION));

  it('grants and revokes nothing, and creates no role, table, view, function or trigger', () => {
    expect(sql).not.toMatch(
      /\b(GRANT|REVOKE|SECURITY DEFINER|CREATE\s+(ROLE|TABLE|VIEW|FUNCTION|TRIGGER)|DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX))\b/i,
    );
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE)\b/);
  });

  it('alters only the classifier call table and indexes only it', () => {
    expect([...new Set([...sql.matchAll(/ALTER TABLE\s+(\w+)/g)].map((m) => m[1]))]).toEqual([
      'orgunit_classifier_calls',
    ]);
    expect(
      [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX\s+\w+\s+ON\s+(\w+)/g)].map((m) => m[1]),
    ).toEqual(['orgunit_classifier_calls']);
  });

  it('adds exactly the admission root, the subject CHECK and the run-scope pin', () => {
    expect(sql).toMatch(
      /FOREIGN KEY \(root_subject_admission_id\) REFERENCES subject_research_admissions \(id\)/,
    );
    expect(sql).toMatch(/orgunit_classifier_calls_subject_root_chk/);
    expect(sql).toMatch(
      /FOREIGN KEY \(run_id, run_root_scope\) REFERENCES orgunit_research_runs \(id, root_scope\)/,
    );
    expect(sql).not.toMatch(/subject_research_admission_revocations/);
    expect(sql).not.toMatch(
      /\b(email|phone|contact|country|score|eligib|verdict|outreach)\w*\s+(text|uuid|integer|boolean|jsonb)/i,
    );
  });
});

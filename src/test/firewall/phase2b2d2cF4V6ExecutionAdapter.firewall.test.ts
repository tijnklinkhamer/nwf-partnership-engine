/**
 * PHASE 2B-2D2C-F4 FIREWALL — THE FINAL-V6 EXECUTION ADAPTER REACHES EXACTLY
 * ITS NARROW EXECUTION GRAPH, AND NOTHING ELSE.
 *
 * The F3 firewall (`phase2b2d2cF3V6ExecutionCandidate.firewall.test.ts`) proves
 * F3 itself has NO execution capability, and it stays exactly as it is. F4 is
 * the deliberate other half: the one adapter that turns the approved F2 study
 * into semantic dispatch. This file proves, by walking real import graphs,
 * module specifiers and code:
 *
 *   - the F4 execution entry points DO reach the intended graph: the F3
 *     authority (preflight + composed decision), the F2 freeze/plan, the
 *     coordinator, the child, the Tier-2 harness and the classifier provider
 *     boundary, and the durable evidence writers;
 *   - they NEVER reach scoring, the v2 scorer, gold projection or loaders,
 *     adjudication, HOLDOUT, a database client, a migration, the web gateway
 *     or the discovery orchestrator, and open no socket module;
 *   - `runExperiment` is called from exactly one place, the study executor,
 *     and only after the F3 all-five preflight and composed decision;
 *   - no F4 entry point offers a study-root, output-root, slot, slot-order,
 *     variant, prompt or freeze override;
 *   - the child-facing study context is pure and imports no coordinator,
 *     provider, scoring or gold module, not even as a type;
 *   - the materialiser has no execution path and never overwrites;
 *   - no Claude model id and no HOLDOUT/gold path is written in f4/ source.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d2c';
const F4_DIR = join(REPO_ROOT, HARNESS, 'f4');

const F4_FILES = [
  'candidateInventoryF4.ts',
  'cliF4.ts',
  'materialiseF4Candidates.ts',
  'studyExecutorF4.ts',
  'studyRecordsF4.ts',
  'v6SlotRunnerPlanF4.ts',
  'v6StudyContextF4.ts',
];

const EXECUTION_ENTRY_POINTS = ['studyExecutorF4.ts', 'cliF4.ts'];

const REQUIRED_REACHABLE = [
  `${HARNESS}/f3/allFivePreflightF3.ts`,
  `${HARNESS}/f3/composedExecutionDecisionF3.ts`,
  `${HARNESS}/f2/freezeF2.ts`,
  `${HARNESS}/f2/studyPlanCoreF2.ts`,
  `${HARNESS}/coordinator.ts`,
  `${HARNESS}/childMain.ts`,
  'src/test/harness/processIsolatedBatch.ts',
  `${HARNESS}/artifacts.ts`,
  'src/orgunits/classify/providerContract.ts',
];

const FORBIDDEN_MODULES = [
  `${HARNESS}/scoring/`,
  `${HARNESS}/f2/scoreV2.ts`,
  `${HARNESS}/goldProjection/`,
  `${HARNESS}/v3d1/`,
  `${HARNESS}/f0h/`,
  'src/orgunits/classify/evaluation/acceptanceSelection.ts',
  'src/orgunits/classify/evaluation/metrics.ts',
  'src/orgunits/classify/evaluation/noninferiority.ts',
  'src/orgunits/classify/evaluation/protocol.ts',
  'src/orgunits/classify/evaluation/select.ts',
  'src/orgunits/classify/evaluation/split.ts',
  'src/orgunits/classify/evaluation/strata.ts',
  'src/db/',
  'migrations/',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/orchestrator/',
];

const FORBIDDEN_NODE_MODULES = ['node:http', 'node:https', 'node:net', 'node:tls', 'node:dns'];
const FORBIDDEN_PACKAGES = ['pg'];

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

function codeOf(name: string): string {
  return readSource(join(F4_DIR, name))
    .replace(/\/\*\*[\s\S]*?\*\//g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function importSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  for (const pattern of [
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [
    base,
    base.replace(/\.js$/, '.ts'),
    `${base}.ts`,
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate) && candidate.endsWith('.ts')) return candidate;
  }
  return null;
}

function graphFrom(entries: readonly string[]): {
  readonly files: readonly string[];
  readonly external: readonly string[];
} {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = entries.map((name) => join(F4_DIR, name));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readSource(file))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) external.add(specifier);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return {
    files: [...visited].map((file) => file.slice(REPO_ROOT.length + 1)).sort(),
    external: [...external].sort(),
  };
}

describe('2D2C-F4: the execution adapter reaches exactly its narrow graph', () => {
  const graph = graphFrom(EXECUTION_ENTRY_POINTS);

  it('f4/ holds exactly the reviewed modules', () => {
    expect(
      readdirSync(F4_DIR)
        .filter((name) => name.endsWith('.ts'))
        .sort(),
    ).toEqual(F4_FILES);
  });

  it('DOES reach the F3 authority, the F2 plan, the coordinator, the child, the Tier-2 harness and the provider boundary', () => {
    for (const required of REQUIRED_REACHABLE) {
      expect(graph.files, `the F4 execution graph does not reach ${required}`).toContain(required);
    }
  });

  it('NEVER reaches scoring, the v2 scorer, gold, adjudication, a database, a migration or a web/orchestrator surface', () => {
    for (const file of [...graph.files, ...graphFrom(F4_FILES).files]) {
      for (const forbidden of FORBIDDEN_MODULES) {
        expect(
          file === forbidden || file.startsWith(forbidden),
          `${file} is reachable from f4/ but is forbidden (${forbidden}).`,
        ).toBe(false);
      }
    }
  });

  it('imports no raw socket module and no database driver', () => {
    for (const specifier of graphFrom(F4_FILES).external) {
      expect(FORBIDDEN_NODE_MODULES, specifier).not.toContain(specifier);
      expect(FORBIDDEN_PACKAGES, specifier).not.toContain(specifier);
    }
  });

  it('the F3 control-only firewall is untouched and still forbids execution machinery in f3/', () => {
    const f3Firewall = readSource(
      join(REPO_ROOT, 'src/test/firewall/phase2b2d2cF3V6ExecutionCandidate.firewall.test.ts'),
    );
    expect(f3Firewall).toContain("'src/test/harness/phase2b2d2c/coordinator.ts',");
    expect(f3Firewall).toContain("'src/test/harness/phase2b2d2c/childMain.ts',");
    for (const name of readdirSync(join(REPO_ROOT, HARNESS, 'f3'))) {
      for (const specifier of importSpecifiersOf(
        readSource(join(REPO_ROOT, HARNESS, 'f3', name)),
      )) {
        expect(specifier, `f3/${name} imports ${specifier}`).not.toContain('/f4/');
      }
    }
  });
});

describe('2D2C-F4: one dispatch site, behind the F3 gates', () => {
  it('runExperiment is called exactly once in f4/, inside the study executor, after the preflight and the composed decision', () => {
    for (const name of F4_FILES) {
      const calls = codeOf(name).match(/\brunExperiment\(/g) ?? [];
      expect(calls.length, name).toBe(name === 'studyExecutorF4.ts' ? 1 : 0);
    }
    const code = codeOf('studyExecutorF4.ts');
    const preflight = code.indexOf('runF3AllFivePreflight({');
    const composed = code.indexOf('evaluateF3ComposedSlotExecutionDecision({');
    const binding = code.indexOf('f4PlanBindingProblem(decision, plan, context)');
    const identity = code.indexOf('writeF4OuterSlotIdentity({');
    const dispatch = code.indexOf('await runExperiment(');
    expect(preflight).toBeGreaterThan(0);
    expect(composed).toBeGreaterThan(preflight);
    expect(binding).toBeGreaterThan(composed);
    expect(identity).toBeGreaterThan(binding);
    expect(dispatch).toBeGreaterThan(identity);
    // The ExperimentInput builder is module-private and takes a GRANTED decision.
    expect(code).toMatch(/\nfunction experimentInputOf\(/);
    expect(code).not.toMatch(/export function experimentInputOf/);
    expect(code).toMatch(/grant: F3ComposedSlotExecutionGrant/);
  });

  it('the executor walks the frozen registry order and never takes a study root, output root, slot or order input', () => {
    const code = codeOf('studyExecutorF4.ts');
    expect(code).toMatch(/for \(const \[index, slot\] of registry\.slots\.entries\(\)\)/);
    expect(code).toContain('const studyRoot = F2_STUDY_ROOT;');
    const inputBlock = code.slice(
      code.indexOf('export interface F4StudyExecutorInput'),
      code.indexOf('export type F4BlockedStage'),
    );
    for (const field of [
      'studyRoot',
      'outputRoot',
      'slotId',
      'startSlot',
      'slotOrder',
      'variant',
      'prompt',
      'freezePath',
      'plan',
    ]) {
      expect(inputBlock, `F4StudyExecutorInput exposes ${field}`).not.toMatch(
        new RegExp(`readonly ${field}\\b`),
      );
    }
    // Never forwards a study-root override to the F3 gates.
    expect(code).not.toMatch(/studyRoot:\s/);
  });

  it('the pre-start checks write nothing and launch nothing', () => {
    const code = codeOf('studyExecutorF4.ts');
    const preStart = code.slice(
      code.indexOf('export function runF4PreStartChecks'),
      code.indexOf('export async function runF4V6StudyExecution'),
    );
    for (const forbidden of ['write', 'launch', 'runExperiment', 'mkdir']) {
      expect(preStart, forbidden).not.toContain(forbidden);
    }
  });

  it('the CLI has one execute flag, no scope override, and its preflight mode never calls the executor', () => {
    const code = codeOf('cliF4.ts');
    for (const flag of [
      '--skip-slot',
      '--start-at',
      '--start-slot',
      '--only-slot',
      '--continue-from',
      '--slot-order',
      '--variant',
      '--prompt',
      '--freeze',
      '--study-root',
      '--output-root',
      '--candidate-set',
      '--control-dir',
    ]) {
      expect(code, flag).not.toContain(`'${flag}'`);
    }
    expect(code).toContain("arg === '--execute'");
    expect(code.match(/runF4V6StudyExecution\(/g) ?? []).toHaveLength(1);
    expect(code).toMatch(/options\.execute\s*\?\s*await runF4V6StudyExecution\(/);
    expect(code).toContain('runF4PreStartChecks({');
    expect(code).toContain('candidatePathForSlot: f4CandidatePathForSlot');
  });

  it('no f4/ module reads a credential or an environment variable, except the CLI handing process.env to the allowlisted child-environment builder', () => {
    for (const name of F4_FILES) {
      const code = codeOf(name);
      for (const credential of ['CLAUDE_CODE_OAUTH_TOKEN', 'setup-token', 'ANTHROPIC_']) {
        expect(code, `${name} names ${credential}`).not.toContain(credential);
      }
      const envReads = code.match(/process\.env/g) ?? [];
      expect(envReads.length, name).toBe(name === 'cliF4.ts' ? 1 : 0);
    }
    expect(codeOf('cliF4.ts')).toMatch(/env: process\.env,/);
  });
});

describe('2D2C-F4: the child-facing study context is pure', () => {
  it('imports no coordinator, variant-root, provider, scoring, gold, filesystem or process module', () => {
    const specifiers = importSpecifiersOf(readSource(join(F4_DIR, 'v6StudyContextF4.ts')));
    expect([...specifiers].sort()).toEqual(
      [
        'node:crypto',
        'zod',
        '../constants.js',
        '../f0o/freezeF0O.js',
        '../f2/freezeF2.js',
        '../f2/studyPlanCoreF2.js',
      ].sort(),
    );
    const code = codeOf('v6StudyContextF4.ts');
    expect(code).not.toMatch(/\bDate\.now\s*\(|\bMath\.random\s*\(/);
    expect(code).not.toContain('process.');
  });
});

describe('2D2C-F4: the materialiser creates candidates only', () => {
  it('has no execution path', () => {
    const code = codeOf('materialiseF4Candidates.ts');
    for (const forbidden of [
      'runF4V6StudyExecution',
      'runExperiment',
      'createF0XProductionLauncher',
      'runProcessIsolatedBatch',
      '.launch(',
      'writeF4OuterSlotIdentity',
      'writeF4StudyManifest',
      'STUDY_EXECUTION_APPROVAL',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('never overwrites, never deletes, creates exactly one directory non-recursively, and never creates the study root', () => {
    const code = codeOf('materialiseF4Candidates.ts');
    const writes = [...code.matchAll(/writeFileSync\(([\s\S]*?)\);/g)].map((m) => m[1] ?? '');
    expect(writes).toHaveLength(2);
    for (const call of writes) expect(call).toContain("flag: 'wx'");
    const mkdirs = code.match(/mkdirSync\(([^)]*)\)/g) ?? [];
    expect(mkdirs).toEqual(['mkdirSync(F4_CANDIDATES_DIRECTORY)']);
    expect(code).not.toMatch(/\b(rmSync|unlinkSync|renameSync|appendFileSync|copyFileSync)\b/);
  });
});

describe('2D2C-F4: no model literal, no HOLDOUT or gold path in f4/ source', () => {
  it('names no Claude model id, no HOLDOUT/gold/adjudication fixture and no gold loader', () => {
    const freeze = JSON.parse(
      readSource(
        join(REPO_ROOT, 'docs/evaluation/PHASE_2B_2D2C_DEV_FINAL_V6_STUDY_FREEZE_F2_V1.json'),
      ),
    ) as {
      corpus: { holdoutFilesNeverRead: string[]; additionalForbiddenFilesForThisStudy: string[] };
      gold: { devLabelsPath: string };
    };
    const forbiddenPaths = [
      ...freeze.corpus.holdoutFilesNeverRead,
      ...freeze.corpus.additionalForbiddenFilesForThisStudy,
      freeze.gold.devLabelsPath,
    ];
    for (const name of F4_FILES) {
      const code = codeOf(name);
      expect(code, name).not.toMatch(/['"`]claude-[a-z]/);
      for (const path of forbiddenPaths) expect(code, `${name} names ${path}`).not.toContain(path);
      for (const loader of [
        'loadDevGold',
        'loadHoldout',
        'loadAdjudicat',
        'goldProjection',
        'devLabelsPath',
      ]) {
        expect(code, `${name} names ${loader}`).not.toContain(loader);
      }
    }
  });
});

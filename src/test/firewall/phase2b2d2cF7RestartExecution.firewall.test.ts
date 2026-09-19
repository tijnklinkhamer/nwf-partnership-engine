/**
 * PHASE 2B-2D2C-F7 FIREWALL — THE F6 RESTART EXECUTION LAYER REACHES EXACTLY
 * ITS NARROW EXECUTION GRAPH, GATES DISPATCH BEHIND HOST-AWAKE AND AUTHORITY,
 * AND NOTHING ELSE.
 *
 * By walking real import graphs, module specifiers and code, this file proves:
 *
 *   - f7/ holds exactly the reviewed modules;
 *   - the execution entry points DO reach the host-awake gate, the F7
 *     authority, the F6 freeze/plan, the reused F4 plan builder, the
 *     coordinator, the child and the provider boundary;
 *   - they NEVER reach scoring, the v2 scorer, gold projection, adjudication,
 *     a database, a migration or a web/orchestrator surface, and open no
 *     socket module;
 *   - `runExperiment` is called from exactly one place, after the host-awake
 *     gate, the all-five preflight, the composed decision, the F6 plan binding,
 *     the per-slot host-awake re-check and the outer identity;
 *   - no entry point offers a study-root, output-root, slot, order, variant,
 *     prompt or freeze override, and the study root is the frozen F6 root;
 *   - the child-facing context is pure and imports no coordinator, provider,
 *     scoring or gold module, not even as a type;
 *   - host observation runs only the frozen read-only commands, with no shell
 *     and no power-setting write;
 *   - the materialiser has no execution path, never overwrites, creates
 *     exactly the control root and one candidate directory, and never the
 *     study root;
 *   - no Claude model id and no HOLDOUT/gold path is written in f7/ source;
 *   - coordinator.ts is untouched by F7, and the F3/F4/F6 firewalls stand.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const HARNESS = 'src/test/harness/phase2b2d2c';
const F7_DIR = join(REPO_ROOT, HARNESS, 'f7');

const F7_FILES = [
  'candidateInventoryF7.ts',
  'cliF7.ts',
  'executionGatesF7.ts',
  'hostAwakeGateF7.ts',
  'hostObservationF7.ts',
  'materialiseF7Candidates.ts',
  'restartStudyContextF7.ts',
  'slotAuthorisationF7.ts',
  'slotRunnerPlanF7.ts',
  'studyExecutionApprovalF7.ts',
  'studyExecutorF7.ts',
  'studyRecordsF7.ts',
  'studyRootsF7.ts',
];

const EXECUTION_ENTRY_POINTS = ['studyExecutorF7.ts', 'cliF7.ts'];

const REQUIRED_REACHABLE = [
  `${HARNESS}/f7/hostAwakeGateF7.ts`,
  `${HARNESS}/f6/hostAwakePreflightF6.ts`,
  `${HARNESS}/f7/executionGatesF7.ts`,
  `${HARNESS}/f6/freezeF6.ts`,
  `${HARNESS}/f6/studyPlanCoreF6.ts`,
  `${HARNESS}/f6/priorStudyIdentityF6.ts`,
  `${HARNESS}/f4/v6SlotRunnerPlanF4.ts`,
  `${HARNESS}/f4/v6StudyContextF4.ts`,
  `${HARNESS}/f3/sequencingF3.ts`,
  `${HARNESS}/coordinator.ts`,
  `${HARNESS}/childMain.ts`,
  'src/test/harness/processIsolatedBatch.ts',
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

/** The commit recording the owner FREEZE-ONLY approval of F6; F7 begins after it. */
const F6_OWNER_FREEZE_APPROVAL_COMMIT = '4a1daf4309e35c8be12b30ae085a9083551fdb8b';

/**
 * F7'S OWN TERMINAL COMMIT, AND WHY THE RANGE HAS ONE.
 *
 * The git check below makes a HISTORICAL claim about F7: F7 changed neither
 * the coordinator, the production classifier, nor any F3/F4/F6 module. It
 * used to prove it with `git diff <base> --`, which compares the base to the
 * WORKING TREE — so it did not bound F7, it bound every phase after F7, and
 * silently asserted that no later work may ever touch `src/orgunits/`. That
 * is a far stronger claim than the one F7 was approved under.
 *
 * `911309e` IS the F7 execution build — the terminal commit of the slice this
 * firewall governs. Bounded there, the claim is proved exactly as written;
 * every forbidden path below is unchanged, and none of F7's other assertions
 * (which read the CURRENT source, not history) is affected at all.
 */
const F7_EXECUTION_BUILD_COMMIT = '911309ecce0621c2ea51b84eb68cf484d332dd4a';

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

/** A shallow clone may not carry both commits; the check is then skipped rather than guessed. */
function approvalCommitAvailable(): boolean {
  return commitExists(F6_OWNER_FREEZE_APPROVAL_COMMIT) && commitExists(F7_EXECUTION_BUILD_COMMIT);
}

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

function codeOf(name: string): string {
  return readSource(join(F7_DIR, name))
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
  const queue = entries.map((name) => join(F7_DIR, name));
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

describe('2D2C-F7: the execution layer reaches exactly its narrow graph', () => {
  const graph = graphFrom(EXECUTION_ENTRY_POINTS);

  it('f7/ holds exactly the reviewed modules', () => {
    expect(
      readdirSync(F7_DIR)
        .filter((name) => !name.startsWith('.'))
        .sort(),
    ).toEqual(F7_FILES);
  });

  it('DOES reach the host-awake gate, the F7 authority, the F6 freeze and plan, the reused F4 plan, the coordinator, the child and the provider boundary', () => {
    for (const required of REQUIRED_REACHABLE) {
      expect(graph.files, `the F7 execution graph does not reach ${required}`).toContain(required);
    }
  });

  it('NEVER reaches scoring, the v2 scorer, gold, adjudication, a database, a migration or a web/orchestrator surface', () => {
    for (const file of [...graph.files, ...graphFrom(F7_FILES).files]) {
      for (const forbidden of FORBIDDEN_MODULES) {
        expect(
          file === forbidden || file.startsWith(forbidden),
          `${file} is reachable from f7/ but is forbidden (${forbidden}).`,
        ).toBe(false);
      }
    }
  });

  it('imports no raw socket module and no database driver', () => {
    for (const specifier of graphFrom(F7_FILES).external) {
      expect(FORBIDDEN_NODE_MODULES, specifier).not.toContain(specifier);
      expect(specifier).not.toBe('pg');
    }
  });

  it('f3/, f4/ and f6/ never import f7/', () => {
    for (const dir of ['f3', 'f4', 'f6']) {
      for (const name of readdirSync(join(REPO_ROOT, HARNESS, dir))) {
        for (const specifier of importSpecifiersOf(
          readSource(join(REPO_ROOT, HARNESS, dir, name)),
        )) {
          expect(specifier, `${dir}/${name} imports ${specifier}`).not.toContain('/f7/');
        }
      }
    }
  });

  it.skipIf(!approvalCommitAvailable())(
    'across F7 itself, from the F6 owner freeze-approval commit to the F7 execution build, it changed neither the coordinator, the production classifier, nor any F3/F4/F6 module',
    () => {
      const changed = execFileSync(
        'git',
        [
          '-C',
          REPO_ROOT,
          'diff',
          '--name-only',
          F6_OWNER_FREEZE_APPROVAL_COMMIT,
          F7_EXECUTION_BUILD_COMMIT,
          '--',
        ],
        { encoding: 'utf8' },
      )
        .split('\n')
        .filter((line) => line.length > 0);
      for (const file of changed) {
        expect(file).not.toBe(`${HARNESS}/coordinator.ts`);
        expect(file.startsWith(`${HARNESS}/f3/`), file).toBe(false);
        expect(file.startsWith(`${HARNESS}/f4/`), file).toBe(false);
        expect(file.startsWith(`${HARNESS}/f6/`), file).toBe(false);
        expect(file.startsWith('src/orgunits/'), file).toBe(false);
      }
    },
  );
});

describe('2D2C-F7: one dispatch site, behind host-awake and the F7 authority', () => {
  it('runExperiment is called exactly once in f7/, after host-awake, preflight, composed decision, plan binding, host re-check and outer identity', () => {
    for (const name of F7_FILES) {
      const calls = codeOf(name).match(/\brunExperiment\(/g) ?? [];
      expect(calls.length, name).toBe(name === 'studyExecutorF7.ts' ? 1 : 0);
    }
    const code = codeOf('studyExecutorF7.ts');
    const execution = code.slice(code.indexOf('export async function runF7RestartStudyExecution'));
    const order = [
      'const hostAtStart = evaluateF7HostAwakeGate(',
      'runF7PreStartChecks({',
      'writeF7StudyManifest(studyRoot',
      'evaluateF7ComposedSlotExecutionDecision({',
      'f7PlanBindingProblem(decision, plan, context)',
      'const hostBeforeSlot = evaluateF7HostAwakeGate(',
      'writeF7OuterSlotIdentity({',
      'await runExperiment(',
    ].map((marker) => {
      const at = execution.indexOf(marker);
      expect(at, marker).toBeGreaterThan(0);
      return at;
    });
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const preStart = code.slice(
      code.indexOf('export function runF7PreStartChecks'),
      code.indexOf('export async function runF7RestartStudyExecution'),
    );
    expect(preStart).toContain('runF7AllFivePreflight({');
    expect(code).toMatch(/\nfunction experimentInputOf\(/);
    expect(code).not.toMatch(/export function experimentInputOf/);
    expect(code).toMatch(/grant: F7ComposedSlotExecutionGrant/);
  });

  it('the executor walks the frozen F6 registry order and takes no study root, output root, slot, order, variant, prompt, freeze or plan input', () => {
    const code = codeOf('studyExecutorF7.ts');
    expect(code).toMatch(/for \(const \[index, slot\] of registry\.slots\.entries\(\)\)/);
    expect(code).toContain('const studyRoot = F7_STUDY_ROOT;');
    const inputBlock = code.slice(
      code.indexOf('export interface F7StudyExecutorInput'),
      code.indexOf('export type F7BlockedStage'),
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
      expect(inputBlock, `F7StudyExecutorInput exposes ${field}`).not.toMatch(
        new RegExp(`readonly ${field}\\b`),
      );
    }
    expect(codeOf('studyRootsF7.ts')).toContain(
      'export const F7_STUDY_ROOT: string = F6_STUDY_ROOT;',
    );
    expect(codeOf('studyRootsF7.ts')).toContain(
      'export const F7_CONTROL_ROOT: string = F6_CONTROL_ROOT;',
    );
  });

  it('the pre-start checks write nothing, launch nothing and never observe or bypass the host gate', () => {
    const code = codeOf('studyExecutorF7.ts');
    const preStart = code.slice(
      code.indexOf('export function runF7PreStartChecks'),
      code.indexOf('export async function runF7RestartStudyExecution'),
    );
    for (const forbidden of ['write', 'launch', 'runExperiment', 'mkdir', 'observeHost']) {
      expect(preStart, forbidden).not.toContain(forbidden);
    }
  });

  it('the CLI has one execute flag, no scope override, requires the operator precondition, and its preview never calls the executor', () => {
    const code = codeOf('cliF7.ts');
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
      '--skip-host-check',
      '--no-caffeinate',
    ]) {
      expect(code, flag).not.toContain(`'${flag}'`);
    }
    expect(code).toContain("arg === '--execute'");
    expect(code.match(/runF7RestartStudyExecution\(/g) ?? []).toHaveLength(1);
    expect(code).toContain("missing.push('--operator-precondition')");
    expect(code).toContain('runF7PreStartChecks({');
    expect(code).toContain('candidatePathForSlot: f7CandidatePathForSlot');
    expect(code).toContain('observeHost: observeHostForF7');
  });

  it('no f7/ module reads a credential; only the CLI hands process.env to the allowlisted child-environment builder', () => {
    for (const name of F7_FILES) {
      const code = codeOf(name);
      for (const credential of ['CLAUDE_CODE_OAUTH_TOKEN', 'setup-token', 'ANTHROPIC_']) {
        expect(code, `${name} names ${credential}`).not.toContain(credential);
      }
      const envReads = code.match(/process\.env/g) ?? [];
      expect(envReads.length, name).toBe(name === 'cliF7.ts' ? 1 : 0);
    }
  });
});

describe('2D2C-F7: the host-awake gate cannot be bypassed and changes no semantics', () => {
  it('the gate module is pure and reads no timeout, retry, watchdog, model or reliability value', () => {
    const code = codeOf('hostAwakeGateF7.ts');
    expect([...importSpecifiersOf(readSource(join(F7_DIR, 'hostAwakeGateF7.ts')))]).toEqual([
      '../f6/hostAwakePreflightF6.js',
    ]);
    for (const forbidden of [
      'TIMEOUT',
      'RETRY',
      'WATCHDOG',
      'RELIABILITY',
      'maxTurns',
      'process.',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('host observation runs only the frozen read-only commands and ps, with no shell and no power-setting write', () => {
    const code = codeOf('hostObservationF7.ts');
    expect(code).toContain('F6_HOST_OBSERVATION_COMMANDS.powerSource');
    expect(code).toContain('F6_HOST_OBSERVATION_COMMANDS.assertions');
    expect(code).toContain('F6_HOST_OBSERVATION_COMMANDS.clamshell');
    expect(code).toContain("const PS = '/bin/ps';");
    expect(code).toContain('shell: false');
    expect(code.match(/execFileSync\(/g) ?? []).toHaveLength(1);
    for (const forbidden of [
      "'-a'",
      "'-b'",
      "'-c'",
      'disablesleep',
      'sleepnow',
      'sudo',
      'spawn(',
      'exec(',
      'writeFile',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('no child-facing or manifest-bearing code carries a host-awake field into the child', () => {
    for (const name of ['restartStudyContextF7.ts', 'slotRunnerPlanF7.ts']) {
      expect(codeOf(name), name).not.toMatch(/hostAwake|caffeinate|Clamshell/);
    }
  });
});

describe('2D2C-F7: the child-facing context is pure', () => {
  it('imports no coordinator, variant-root, provider, scoring, gold, filesystem or process module', () => {
    const specifiers = importSpecifiersOf(readSource(join(F7_DIR, 'restartStudyContextF7.ts')));
    expect([...specifiers].sort()).toEqual(
      [
        'node:crypto',
        'zod',
        '../constants.js',
        '../f2/studyPlanCoreF2.js',
        '../f4/v6StudyContextF4.js',
        '../f6/freezeF6.js',
        '../f6/priorStudyIdentityF6.js',
        '../f6/studyPlanCoreF6.js',
      ].sort(),
    );
    const code = codeOf('restartStudyContextF7.ts');
    expect(code).not.toMatch(/\bDate\.now\s*\(|\bMath\.random\s*\(/);
    expect(code).not.toContain('process.');
  });
});

describe('2D2C-F7: the materialiser creates candidates only', () => {
  it('has no execution path', () => {
    const code = codeOf('materialiseF7Candidates.ts');
    for (const forbidden of [
      'runF7RestartStudyExecution',
      'runExperiment',
      'createF0XProductionLauncher',
      'runProcessIsolatedBatch',
      '.launch(',
      'writeF7OuterSlotIdentity',
      'writeF7StudyManifest',
      'STUDY_EXECUTION_APPROVAL',
      'observeHostForF7',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('never overwrites or deletes, creates exactly the control root and one candidate directory non-recursively, and never the study root', () => {
    const code = codeOf('materialiseF7Candidates.ts');
    const writes = [...code.matchAll(/writeFileSync\(([\s\S]*?)\);/g)].map((m) => m[1] ?? '');
    expect(writes).toHaveLength(2);
    for (const call of writes) expect(call).toContain("flag: 'wx'");
    expect(code.match(/mkdirSync\(([^)]*)\)/g) ?? []).toEqual([
      'mkdirSync(F7_CONTROL_ROOT)',
      'mkdirSync(F7_CANDIDATES_DIRECTORY)',
    ]);
    expect(code).not.toMatch(/\b(rmSync|unlinkSync|renameSync|appendFileSync|copyFileSync)\b/);
    expect(code).toContain('assertF5EvidenceUnchanged();');
  });
});

describe('2D2C-F7: no model literal, no HOLDOUT or gold path in f7/ source', () => {
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
    for (const name of F7_FILES) {
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

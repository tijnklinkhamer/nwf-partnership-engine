/**
 * CLASSIFIER_OPERATOR_ENTRY_POINT_V1 — the boundary of `nwf-pe orgunits
 * classify`, proven without a database and without any provider:
 *
 *   A. argument bounds: organisation, run and model are mandatory; attempt
 *      defaults to 1 and is a positive integer; every refusal is row-less,
 *      pool-less and provider-less;
 *   B. the pure preflight and the research completion gate refuse before
 *      the classifier role or a provider is ever reached;
 *   C. the identity tuple has ONE construction, byte-equivalent to the one
 *      the orchestrator used inline at the reconciliation terminal;
 *   D. production wiring: the Max-only provider with the production runners,
 *      loaded dynamically on the execute path only, repair DISABLED,
 *      runConfig/requestConfig empty, research/classifier roles only;
 *   E. no institutional network: the command's whole import graph reaches
 *      nothing under orgunits/web/ and no discovery runtime;
 *   F. changed surface since the reconciliation terminal: no migration, no
 *      classifier semantic file, no allowlist, no evaluation artifact;
 *   G. the engineering record is a result, not an authority.
 *
 * The production runner factories are referred to by CONSTRUCTED names
 * only: `phase2b.firewall.test.ts` forbids any test from spelling them.
 *
 * FROZEN AT THE ENTRY-POINT TERMINAL. The entry-point slice is closed: every
 * lineage, changed-surface, router-diff, orchestrate/persist diff, migration,
 * docs and record assertion below is evaluated over the exact range
 * RECONCILIATION_TERMINAL..CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL (and file
 * bodies at that exact tree), never over HEAD or the working tree, so a later,
 * separately authorised slice (the classifier operator read models first) is
 * never judged against this slice's own authorised surface, and this slice is
 * never made retrospectively to contain anything that landed after it. The
 * behavioural sections (A-E) still exercise the live execution action,
 * because a behaviour cannot be read out of a git tree and the action itself
 * must stay exactly as accepted.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type pg from 'pg';
import { describe, expect, it } from 'vitest';
import {
  CLASSIFIER_OPERATOR_REPAIR_POLICY,
  CLASSIFIER_OPERATOR_REQUEST_CONFIG,
  CLASSIFIER_OPERATOR_RUN_CONFIG,
  executeClassifyCommand,
  parseClassifyArguments,
  type ClassifyDependencies,
  type ClassifyOptions,
} from '../../cli/commands/classify.js';
import { buildClassifierCallIdentity } from '../../orgunits/classify/callIdentity.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../orgunits/classify/constants.js';
import { computeFinalInputSha256 } from '../../orgunits/classify/finalIdentity.js';
import { planStateFor } from '../../orgunits/classify/operatorPlan.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import { ORGUNIT_CLASSIFIER_PROMPT_VERSION } from '../../orgunits/classify/prompt.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import {
  FORBIDDEN_AUTH_VARIABLES,
  PROHIBITED_SETUP_TOKEN_VARIABLE,
} from '../../orgunits/classify/provider/authConflicts.js';
import { REPAIR_POLICY_DISABLED } from '../../orgunits/classify/repair.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const RECONCILIATION_TERMINAL = '3390f61f44f65513ca6b71969b528591f3978e49';
const CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL = '2b9d0d9c94bda00bbe88758b2c207ecadc300934';
/** The four entry-point commits above the reconciliation terminal, oldest first. */
const ENTRY_POINT_COMMITS = [
  '900f45c37311fdbd4eb6bae3f7038a16104cbf84',
  '9f4734f814671be6d141101c279da0e32c5a469b',
  '20b3829922ec2836f214c724175963148c875e18',
  CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL,
];
const R52_TERMINAL = 'b1dfd82542e7dfb749d5c36063ea750647428a12';
const RECONCILIATION_TEST = 'src/test/unit/engineRuntimeLineageReconciliationV1.test.ts';
const THIS_TEST = 'src/test/unit/classifierOperatorEntryPointV1.test.ts';
const INTEGRATION_TEST = 'src/test/integration/classifierOperatorEntryPoint.test.ts';
const RECORD = 'docs/evaluation/PHASE_2B_2D_CLASSIFIER_OPERATOR_ENTRY_POINT_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_CLASSIFIER_OPERATOR_ENTRY_POINT_V1.md';
const R52_RELEASE =
  'docs/evaluation/PHASE_2B_2D_A4_R52_HUMAN_REVIEW_DEFERRAL_AND_ENGINEERING_RELEASE_V1.json';

const CLASSIFY_CLI = 'src/cli/commands/classify.ts';
const PROVIDER_WIRING = 'src/cli/commands/classifyProvider.ts';
const CLI_INDEX = 'src/cli/index.ts';

/** The exact production surface this slice is authorised to touch. */
const AUTHORISED_PRODUCTION_FILES = [
  CLASSIFY_CLI,
  PROVIDER_WIRING,
  CLI_INDEX,
  'src/orgunits/classify/callIdentity.ts',
  'src/orgunits/classify/operatorPlan.ts',
  'src/orgunits/classify/orchestrate.ts',
  'src/orgunits/classify/persist.ts',
].sort();

/** Classifier semantics, selection and provider behaviour: byte-unchanged in this slice. */
const SEMANTIC_FILES = [
  'src/orgunits/classify/prompt.ts',
  'src/orgunits/classify/outputSchema.ts',
  'src/orgunits/classify/validate.ts',
  'src/orgunits/classify/evidenceVerification.ts',
  'src/orgunits/classify/repair.ts',
  'src/orgunits/classify/finalIdentity.ts',
  'src/orgunits/classify/canonical.ts',
  'src/orgunits/classify/assemble.ts',
  'src/orgunits/classify/loaders.ts',
  'src/orgunits/classify/ordering.ts',
  'src/orgunits/classify/dedupe.ts',
  'src/orgunits/classify/document.ts',
  'src/orgunits/classify/constants.ts',
  'src/orgunits/classify/types.ts',
  'src/orgunits/classify/runStatus.ts',
  'src/orgunits/classify/providerContract.ts',
  'src/orgunits/classify/retry.ts',
];

/** Built from parts: a test may not spell the production runner factory names. */
const SDK_RUNNER_FACTORY = ['createProduction', 'AgentSdkRunner'].join('');
const AUTH_STATUS_RUNNER_FACTORY = ['createProduction', 'AuthStatusRunner'].join('');

const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const CLEAN_ENV = Object.freeze({ HOME: '/zz-home' });

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 256 << 20 });
}
function commitExists(commit: string): boolean {
  try {
    git('cat-file', '-e', `${commit}^{commit}`);
    return true;
  } catch {
    return false;
  }
}
const lines = (value: string): string[] => value.split('\n').filter((l) => l.length > 0);
const read = (path: string): string => readFileSync(join(REPO_ROOT, path), 'utf8');
/** Source with comments stripped, so prose never trips a check. */
const code = (path: string): string =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const T = CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL;
/** A file's exact text at the entry-point terminal tree - never the working tree. */
const atTerminal = (path: string): string => git('show', `${T}:${path}`);
const existsAtTerminal = (path: string): boolean =>
  git('ls-tree', '--name-only', T, '--', path).trim() === path;

const terminalAvailable = commitExists(RECONCILIATION_TERMINAL) && commitExists(T);
const recordsPresent = terminalAvailable && [RECORD, AUDIT].every(existsAtTerminal);

/** The entry-point slice's exact changed surface: RECONCILIATION_TERMINAL..T, never HEAD. */
function changedInEntryPoint(): string[] {
  return lines(git('diff', '--name-only', RECONCILIATION_TERMINAL, T));
}

interface Spy {
  readonly deps: ClassifyDependencies;
  readonly research: () => number;
  readonly classifier: () => number;
  readonly providers: () => number;
  readonly out: () => string;
}

/** Dependencies whose every capability is COUNTED; the classifier pool and the provider throw if reached. */
function spy(
  env: Readonly<Record<string, string | undefined>> = CLEAN_ENV,
  completion: { terminal_state: string; error_kind: string | null } | null = null,
): Spy {
  let research = 0;
  let classifier = 0;
  let providers = 0;
  let out = '';
  const researchPool = {
    query: () => Promise.resolve({ rows: completion === null ? [] : [completion] }),
  } as unknown as pg.Pool;
  return {
    deps: {
      withResearchPool: (fn) => {
        research += 1;
        return fn(researchPool);
      },
      withClassifierPool: () => {
        classifier += 1;
        return Promise.reject(new Error('the classifier role must not be reached in this test'));
      },
      env,
      repoRoot: '/zz-repo',
      createProvider: () => {
        providers += 1;
        return Promise.reject(new Error('the provider must not be constructed in this test'));
      },
      stdout: (t) => {
        out += t;
      },
      stderr: (t) => {
        out += t;
      },
    },
    research: () => research,
    classifier: () => classifier,
    providers: () => providers,
    out: () => out,
  };
}

const base = (overrides: Partial<ClassifyOptions> = {}): ClassifyOptions => ({
  organisationId: ORG,
  runId: RUN,
  model: MODEL,
  execute: true,
  json: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// A. ARGUMENT BOUNDS.
// ---------------------------------------------------------------------------

describe('classifier operator entry point: argument bounds', () => {
  it('attempt defaults to exactly 1 and is never derived', () => {
    expect(parseClassifyArguments(base())).toEqual({
      ok: true,
      value: { organisationId: ORG, runId: RUN, modelId: MODEL, attemptNo: 1 },
    });
    const two = parseClassifyArguments(base({ attempt: '2' }));
    expect(two.ok && two.value.attemptNo).toBe(2);
  });

  it.each([
    ['missing organisation-id', { organisationId: undefined }, /--organisation-id/],
    ['empty organisation-id', { organisationId: '' }, /--organisation-id/],
    ['non-UUID organisation-id', { organisationId: 'all' }, /single UUID/],
    ['missing run-id', { runId: undefined }, /--run-id.*no "latest run"/s],
    ['non-UUID run-id', { runId: 'latest' }, /single UUID/],
    ['missing model', { model: undefined }, /--model.*no default classifier model/s],
    ['attempt 0', { attempt: '0' }, /--attempt/],
    ['attempt negative', { attempt: '-1' }, /--attempt/],
    ['attempt fractional', { attempt: '1.5' }, /--attempt/],
    ['attempt exponent', { attempt: '1e1' }, /--attempt/],
    ['attempt non-numeric', { attempt: 'next' }, /--attempt/],
    ['attempt NaN', { attempt: 'NaN' }, /--attempt/],
    ['attempt leading zero', { attempt: '01' }, /--attempt/],
    ['attempt beyond integer column', { attempt: '2147483648' }, /--attempt/],
  ] as const)('%s refuses with zero pools and zero providers', async (_label, override, msg) => {
    const parsed = parseClassifyArguments(base(override as Partial<ClassifyOptions>));
    expect(parsed.ok).toBe(false);
    for (const execute of [false, true]) {
      const s = spy();
      const exit = await executeClassifyCommand(
        base({ ...(override as Partial<ClassifyOptions>), execute }),
        s.deps,
      );
      expect(exit).toBe(1);
      expect(s.out()).toMatch(msg);
      expect([s.research(), s.classifier(), s.providers()]).toEqual([0, 0, 0]);
    }
  });

  it('an unknown model refuses through the existing allowlist preflight, in dry run and execute', async () => {
    for (const execute of [false, true]) {
      const s = spy();
      expect(await executeClassifyCommand(base({ model: 'auto', execute }), s.deps)).toBe(1);
      expect(s.out()).toContain('MODEL_NOT_ALLOWED');
      expect([s.research(), s.classifier(), s.providers()]).toEqual([0, 0, 0]);
    }
  });

  it('every allowlisted model is accepted equally - none is privileged', () => {
    for (const model of ORGUNIT_CLASSIFIER_ALLOWED_MODELS) {
      expect(parseClassifyArguments(base({ model })).ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// B. ROW-LESS PREFLIGHT AND THE COMPLETION GATE.
// ---------------------------------------------------------------------------

describe('classifier operator entry point: row-less refusals before the classifier role', () => {
  it.each([
    [
      'a conflicting auth/provider-routing variable',
      { [FORBIDDEN_AUTH_VARIABLES[0]!]: 'x' },
      'CONFLICTING_AUTH_VARIABLES',
    ],
    [
      'the prohibited setup-token variable',
      { [PROHIBITED_SETUP_TOKEN_VARIABLE]: 'x' },
      'SETUP_TOKEN_PRESENT',
    ],
    ['an unresolvable profile directory', { HOME: undefined }, 'PROFILE_DIR_UNRESOLVED'],
  ])('--execute with %s refuses before any pool or provider', async (_label, env, kind) => {
    const s = spy({ ...CLEAN_ENV, ...env });
    expect(await executeClassifyCommand(base(), s.deps)).toBe(1);
    expect(s.out()).toContain(kind);
    expect([s.research(), s.classifier(), s.providers()]).toEqual([0, 0, 0]);
  });

  it('a dry run under a non-model preflight refusal still never constructs a provider', async () => {
    const s = spy(
      { ...CLEAN_ENV, [PROHIBITED_SETUP_TOKEN_VARIABLE]: 'x' },
      { terminal_state: 'COMPLETED', error_kind: null },
    );
    await expect(executeClassifyCommand(base({ execute: false }), s.deps)).rejects.toThrow(
      /classifier role must not be reached/,
    );
    expect(s.research()).toBe(1);
    expect(s.providers()).toBe(0);
  });

  it.each([
    ['FAILED', { terminal_state: 'FAILED', error_kind: 'OTHER' }],
    ['ABORTED', { terminal_state: 'ABORTED', error_kind: null }],
    ['NO_COMPLETION_RECORDED', null],
  ] as const)('a %s research run refuses before the classifier role', async (status, row) => {
    for (const execute of [false, true]) {
      const s = spy(CLEAN_ENV, row);
      expect(await executeClassifyCommand(base({ execute }), s.deps)).toBe(1);
      expect(s.out()).toContain(`is ${status}, not COMPLETED`);
      expect([s.research(), s.classifier(), s.providers()]).toEqual([1, 0, 0]);
    }
  });
});

// ---------------------------------------------------------------------------
// C. ONE IDENTITY CONSTRUCTION.
// ---------------------------------------------------------------------------

describe('classifier operator entry point: one identity implementation', () => {
  it('buildClassifierCallIdentity equals the inline construction orchestrate.ts used at the reconciliation terminal', () => {
    for (const [assemblyInputSha256, modelId, attemptNo] of [
      ['a'.repeat(64), 'model-a', 1],
      ['0123456789abcdef'.repeat(4), 'model-b', 7],
    ] as const) {
      expect(buildClassifierCallIdentity({ assemblyInputSha256, modelId, attemptNo })).toEqual({
        inputSha256: computeFinalInputSha256({
          assemblyInputSha256,
          promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
          outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
        }),
        modelId,
        promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
        classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
        outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
        attemptNo,
      });
    }
  });

  it('the identity excludes the model from the input hash and includes the attempt only in the tuple', () => {
    const a = buildClassifierCallIdentity({
      assemblyInputSha256: 'b'.repeat(64),
      modelId: 'm1',
      attemptNo: 1,
    });
    const b = buildClassifierCallIdentity({
      assemblyInputSha256: 'b'.repeat(64),
      modelId: 'm2',
      attemptNo: 2,
    });
    expect(a.inputSha256).toBe(b.inputSha256);
  });

  it.skipIf(!terminalAvailable)(
    'orchestrate.ts at the entry-point terminal equals its reconciliation-terminal bytes with ONLY the inline identity block replaced by the shared helper',
    () => {
      const before = git('show', `${RECONCILIATION_TERMINAL}:src/orgunits/classify/orchestrate.ts`);
      const replacements: [string, string][] = [
        [
          ' *   4. compute the final input identity (`finalIdentity.ts`)\n',
          ' *   4. compute the final input identity (`finalIdentity.ts`, via the one\n' +
            ' *      shared identity-tuple construction in `callIdentity.ts`)\n',
        ],
        [
          "import { computeFinalInputSha256 } from './finalIdentity.js';\n",
          "import { buildClassifierCallIdentity } from './callIdentity.js';\n",
        ],
        [
          '  const identity = {\n' +
            '    inputSha256: computeFinalInputSha256({\n' +
            '      assemblyInputSha256: assembledBatch.assemblyInputSha256,\n' +
            '      promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,\n' +
            '      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,\n' +
            '    }),\n' +
            '    modelId: input.modelId,\n' +
            '    promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,\n' +
            '    classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,\n' +
            '    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,\n' +
            '    attemptNo,\n' +
            '  };\n',
          '  const identity = buildClassifierCallIdentity({\n' +
            '    assemblyInputSha256: assembledBatch.assemblyInputSha256,\n' +
            '    modelId: input.modelId,\n' +
            '    attemptNo,\n' +
            '  });\n',
        ],
      ];
      let expected = before;
      for (const [from, to] of replacements) {
        expect(expected.split(from), from).toHaveLength(2);
        expected = expected.replace(from, to);
      }
      expect(atTerminal('src/orgunits/classify/orchestrate.ts')).toBe(expected);
    },
  );

  it.skipIf(!terminalAvailable)(
    'persist.ts only GAINED a read in the entry-point slice: no line was removed or rewritten',
    () => {
      const diff = lines(
        git('diff', '-U0', RECONCILIATION_TERMINAL, T, '--', 'src/orgunits/classify/persist.ts'),
      ).filter((l) => /^[+-][^+-]/.test(l));
      expect(diff.filter((l) => l.startsWith('-'))).toEqual([]);
      const added = diff.join('\n');
      expect(added).toContain('export async function findCallStateAtIdentity(');
      expect(added).not.toMatch(/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|TRUNCATE/i);
    },
  );

  it('a non-completed persisted identity is never reusable and never READY', () => {
    expect(planStateFor('ABSENT')).toBe('READY_NEW_ATTEMPT');
    expect(planStateFor('COMPLETED')).toBe('REUSABLE_COMPLETED');
    for (const state of ['PARTIAL', 'FAILED', 'NO_COMPLETION_RECORDED'] as const) {
      expect(planStateFor(state)).toBe('ATTEMPT_ALREADY_EXISTS_NON_COMPLETED');
    }
  });
});

// ---------------------------------------------------------------------------
// D. PRODUCTION WIRING.
// ---------------------------------------------------------------------------

describe('classifier operator entry point: production wiring', () => {
  it('the wiring module constructs exactly the Max-only provider with both production runners', () => {
    const wiring = code(PROVIDER_WIRING);
    expect(wiring).toMatch(/new\s+ClaudeMaxAgentProvider\s*\(/);
    expect(wiring).toContain(`runner: ${SDK_RUNNER_FACTORY}()`);
    expect(wiring).toContain(`authStatusRunner: ${AUTH_STATUS_RUNNER_FACTORY}()`);
    // The executable is the provider's own SDK-bundled default - never overridden, never PATH.
    for (const banned of [
      'claudeCodeExecutable',
      'executablePath',
      'process.env',
      'PATH',
      'which',
      'apiKey',
      'ANTHROPIC',
      'oauth',
      'credentials',
      'allowedModels',
      'env:',
    ]) {
      expect(wiring, banned).not.toContain(banned);
    }
  });

  it('the command loads the wiring ONLY by a dynamic import on the execute path', () => {
    const cli = code(CLASSIFY_CLI);
    expect(cli).toContain("await import('./classifyProvider.js')");
    expect(cli).not.toMatch(/from\s+['"]\.\/classifyProvider\.js['"]/);
    for (const name of [
      SDK_RUNNER_FACTORY,
      AUTH_STATUS_RUNNER_FACTORY,
      'ClaudeMaxAgentProvider',
      'agentSdkRunner',
      'authStatusRunner',
      'claude-agent-sdk',
    ]) {
      expect(cli, name).not.toContain(name);
    }
    expect(code(CLI_INDEX)).not.toContain('classifyProvider');
  });

  it('only the wiring module and the provider namespace name the production runner factories', () => {
    const production = lines(git('ls-files', 'src')).filter(
      (p) => p.endsWith('.ts') && !p.startsWith('src/test/'),
    );
    const naming = production.filter((p) => {
      const source = code(p);
      return source.includes(SDK_RUNNER_FACTORY) || source.includes(AUTH_STATUS_RUNNER_FACTORY);
    });
    expect(naming.filter((p) => !p.startsWith('src/orgunits/classify/provider/')).sort()).toEqual([
      PROVIDER_WIRING,
    ]);
  });

  it('repair is explicitly DISABLED, and V1 exposes no repair or tuning control', () => {
    expect(CLASSIFIER_OPERATOR_REPAIR_POLICY).toBe(REPAIR_POLICY_DISABLED);
    expect(CLASSIFIER_OPERATOR_RUN_CONFIG).toEqual({});
    expect(CLASSIFIER_OPERATOR_REQUEST_CONFIG).toEqual({});
    expect(Object.isFrozen(CLASSIFIER_OPERATOR_RUN_CONFIG)).toBe(true);
    expect(Object.isFrozen(CLASSIFIER_OPERATOR_REQUEST_CONFIG)).toBe(true);
    const cli = code(CLASSIFY_CLI);
    expect(cli).toContain('repairPolicy: CLASSIFIER_OPERATOR_REPAIR_POLICY');
    expect(cli).toContain('requestConfig: CLASSIFIER_OPERATOR_REQUEST_CONFIG');
    expect(cli).toContain('runConfig: CLASSIFIER_OPERATOR_RUN_CONFIG');
    expect(cli).not.toContain('REPAIR_POLICY_ONE_ROUND');
    const index = code(CLI_INDEX);
    for (const flag of ['repair', 'max-turns', 'maxTurns', 'thinking', 'effort', 'temperature']) {
      expect(index, flag).not.toMatch(new RegExp(`['"]${flag}['"]\\s*:`));
    }
  });

  it('uses the research role ONLY for the completion gate and the classifier role for the rest - never admin or ingest', () => {
    const cli = code(CLASSIFY_CLI);
    expect(cli.match(/withPool\(\s*'research'/g)).toHaveLength(1);
    expect(cli.match(/withPool\(\s*'classifier'/g)).toHaveLength(1);
    expect(cli).not.toMatch(/withPool\(\s*'(admin|ingest|readonly)'/);
    expect(cli).not.toMatch(/createPool\s*\(/);
    expect(cli.match(/deps\.withResearchPool\(/g)).toHaveLength(1);
    expect(cli).toMatch(
      /deps\.withResearchPool\(\(pool\)\s*=>\s*checkRunCompleted\(pool, args\.runId\)/,
    );
    expect(cli.match(/deps\.withClassifierPool\(/g)).toHaveLength(1);
    expect(cli).not.toMatch(/INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|SELECT\s/i);
  });

  it('declares no default organisation, run or model, no sweep, no latest-run and no auto-increment', () => {
    const cli = code(CLASSIFY_CLI);
    for (const banned of [
      /attemptNo\s*\+\s*1/,
      /attempt\s*\+\+/,
      /ORDER BY/i,
      /latestRun|findLatest|mostRecent|lastRun/i,
      /--all\b/,
      /allOrganisations|scanDatabase|forEachOrganisation/,
      /ORGUNIT_CLASSIFIER_ALLOWED_MODELS\[/,
      /runOrganisationDiscovery/,
    ]) {
      expect(cli, String(banned)).not.toMatch(banned);
    }
  });

  it.skipIf(!terminalAvailable)(
    'at the entry-point terminal, routed `orgunits classify` with exactly the three new options, and kept every older command',
    () => {
      const index = atTerminal(CLI_INDEX);
      expect(index).toContain(
        'nwf-pe orgunits classify    --organisation-id <uuid> --run-id <uuid>',
      );
      for (const option of [
        "'run-id': { type: 'string' }",
        "model: { type: 'string' }",
        "attempt: { type: 'string' }",
      ]) {
        expect(index).toContain(option);
      }
      expect(index).toContain("if (group === 'orgunits' && sub === 'classify')");
      expect(index).toContain("if (group === 'orgunits' && sub === 'discover')");
      expect(index).toContain('strict: true');
      const added = lines(git('diff', '-U0', RECONCILIATION_TERMINAL, T, '--', CLI_INDEX))
        .filter((l) => /^\+[^+]/.test(l))
        .join('\n');
      expect(added.match(/^\+\s+'?[\w-]+'?: \{ type: '(string|boolean)'/gm)).toEqual([
        "+      'run-id': { type: 'string'",
        "+      model: { type: 'string'",
        "+      attempt: { type: 'string'",
      ]);
    },
  );

  it.skipIf(!terminalAvailable)(
    'the entry-point router diff was additive: no existing line was removed',
    () => {
      const diff = lines(git('diff', '-U0', RECONCILIATION_TERMINAL, T, '--', CLI_INDEX)).filter(
        (l) => /^[+-][^+-]/.test(l),
      );
      expect(diff.filter((l) => l.startsWith('-'))).toEqual([]);
    },
  );

  it.skipIf(!terminalAvailable)(
    'no classifier read-model command, module or option existed at the entry-point terminal',
    () => {
      const index = atTerminal(CLI_INDEX);
      expect(index).not.toMatch(/classify\s+(runs|calls|show)\b/);
      expect(index).not.toContain("'call-id'");
      expect(index).not.toMatch(/classifyRead|runOrgunitsClassify(Runs|Calls|Show)/);
      expect(existsAtTerminal('src/cli/commands/classifyRead.ts')).toBe(false);
      expect(existsAtTerminal('src/orgunits/classify/operatorReadModels.ts')).toBe(false);
      expect(
        lines(git('ls-tree', '-r', '--name-only', T, '--', 'src')).filter((p) =>
          /read-?model/i.test(p),
        ),
      ).toEqual([]);
    },
  );

  it('the runtime this command composes is still fetch policy v7', () => {
    expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v7');
  });
});

// ---------------------------------------------------------------------------
// E. NO INSTITUTIONAL NETWORK.
// ---------------------------------------------------------------------------

function importClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = read(file);
    const specifiers = [
      ...source.matchAll(/\bimport\s+(?:type\s+)?[^;]*?\bfrom\s*['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...source.matchAll(/\bexport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ].map((m) => m[1]!);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      const target = relative(
        REPO_ROOT,
        resolve(dirname(join(REPO_ROOT, file)), specifier.replace(/\.js$/, '.ts')),
      );
      if (existsSync(join(REPO_ROOT, target))) pending.push(target);
    }
  }
  return seen;
}

describe('classifier operator entry point: no institutional network', () => {
  /**
   * The landed classifier runtime (document.ts, ordering.ts, validate.ts,
   * repair.ts) reuses three PURE text helpers that live under orgunits/web/.
   * They open no socket (phase2b firewall) and are pinned here by exact name:
   * anything else under web/ - the gateway, robots, authority, observations -
   * would be a new network-capable reach.
   */
  const PURE_WEB_TEXT_HELPERS = [
    'src/orgunits/web/evidenceCanonical.ts',
    'src/orgunits/web/extract.ts',
    'src/orgunits/web/redact.ts',
  ];

  it('the command files import nothing under orgunits/web/ or the discovery runtime directly', () => {
    for (const file of [CLASSIFY_CLI, PROVIDER_WIRING, CLI_INDEX]) {
      const source = code(file);
      expect(source, file).not.toContain('orgunits/web');
      expect(source, file).not.toContain('orgunits/orchestrator');
      expect(source, file).not.toContain('runOrganisationDiscovery');
      expect(source, file).not.toContain('executeWebAttempt');
    }
  });

  it('transitively, the command reaches no gateway, robots, discovery or socket - only the landed pure text helpers', () => {
    for (const entry of [CLASSIFY_CLI, PROVIDER_WIRING]) {
      const closure = [...importClosure(entry)];
      expect(
        closure.filter(
          (p) => p.startsWith('src/orgunits/web/') && !PURE_WEB_TEXT_HELPERS.includes(p),
        ),
        entry,
      ).toEqual([]);
      expect(
        closure.filter(
          (p) =>
            p.startsWith('src/orgunits/orchestrator/') &&
            p !== 'src/orgunits/orchestrator/clock.ts',
        ),
        entry,
      ).toEqual([]);
      expect(
        closure.filter((p) => p.startsWith('src/orgunits/signals/')),
        entry,
      ).toEqual([]);
      expect(closure, entry).not.toContain('src/orgunits/sitemap.ts');
      expect(closure, entry).not.toContain('src/cli/commands/discover.ts');
      for (const file of closure) {
        expect(code(file), file).not.toMatch(/from\s+['"]node:(net|tls|http|https|dns)['"]/);
        expect(code(file), file).not.toMatch(/\bfetch\s*\(/);
      }
    }
    expect(
      [...importClosure(CLASSIFY_CLI)].filter((p) => p.startsWith('src/orgunits/web/')).sort(),
    ).toEqual(PURE_WEB_TEXT_HELPERS);
  });
});

// ---------------------------------------------------------------------------
// F. CHANGED SURFACE SINCE THE RECONCILIATION TERMINAL.
// ---------------------------------------------------------------------------

describe.skipIf(!terminalAvailable)('classifier operator entry point: changed surface', () => {
  it('descends from the reconciliation terminal with exactly four single-parent commits, first freezing the reconciliation test', () => {
    expect(() => git('merge-base', '--is-ancestor', RECONCILIATION_TERMINAL, T)).not.toThrow();
    expect(() => git('merge-base', '--is-ancestor', T, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${RECONCILIATION_TERMINAL}..${T}`))).toEqual([]);
    expect(lines(git('rev-list', '--reverse', `${RECONCILIATION_TERMINAL}..${T}`))).toEqual(
      ENTRY_POINT_COMMITS,
    );
    for (const commit of ENTRY_POINT_COMMITS) {
      expect(
        lines(git('rev-list', '--parents', '-n', '1', commit))[0]!.split(' '),
        commit,
      ).toHaveLength(2);
    }
    const [first] = lines(git('rev-list', '--reverse', `${RECONCILIATION_TERMINAL}..${T}`));
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(git('rev-parse', `${first}^`).trim()).toBe(RECONCILIATION_TERMINAL);
    expect(lines(git('diff', '--name-only', RECONCILIATION_TERMINAL, first))).toEqual([
      RECONCILIATION_TEST,
    ]);
    expect(lines(git('log', '-1', '--format=%s', first))[0]).toMatch(
      /freeze runtime reconciliation/,
    );
  });

  it('changed production code exactly within the authorised operator surface', () => {
    const production = changedInEntryPoint().filter(
      (p) => p.startsWith('src/') && !p.startsWith('src/test/'),
    );
    expect(production.filter((p) => !AUTHORISED_PRODUCTION_FILES.includes(p))).toEqual([]);
    expect(production.sort()).toEqual(AUTHORISED_PRODUCTION_FILES);
  });

  it('changes nothing outside the operator surface, its tests, the reconciliation pin, the record and the audit', () => {
    const permitted = new Set([
      ...AUTHORISED_PRODUCTION_FILES,
      RECONCILIATION_TEST,
      THIS_TEST,
      INTEGRATION_TEST,
      RECORD,
      AUDIT,
    ]);
    expect(changedInEntryPoint().filter((p) => !permitted.has(p))).toEqual([]);
    expect(changedInEntryPoint().sort()).toEqual([...permitted].sort());
  });

  it('changes no classifier semantic, provider, allowlist, web, discovery, migration or package byte', () => {
    expect(
      changedInEntryPoint().filter(
        (p) =>
          SEMANTIC_FILES.includes(p) ||
          p.startsWith('src/orgunits/classify/provider/') ||
          p.startsWith('src/orgunits/classify/evaluation/') ||
          p.startsWith('src/orgunits/web/') ||
          p.startsWith('src/orgunits/orchestrator/') ||
          p.startsWith('src/orgunits/signals/') ||
          p === 'src/orgunits/sitemap.ts' ||
          p === 'src/cli/commands/discover.ts' ||
          /^(migrations|scripts|docker|\.github)\//.test(p) ||
          /^package(-lock)?\.json$/.test(p) ||
          p === 'CLAUDE.md',
      ),
    ).toEqual([]);
  });

  it('the migration set at the entry-point terminal is exactly the reconciliation set (through 0012)', () => {
    const now = lines(git('ls-tree', '-r', '--name-only', T, '--', 'migrations'));
    expect(now).toEqual(
      lines(git('ls-tree', '-r', '--name-only', RECONCILIATION_TERMINAL, '--', 'migrations')),
    );
    expect(now.at(-1)).toMatch(/^migrations\/0012_/);
  });

  it('modifies no existing document and adds only this record and audit under docs/', () => {
    const prior = lines(git('ls-tree', '-r', '--name-only', RECONCILIATION_TERMINAL, '--', 'docs'));
    expect(lines(git('diff', '--name-only', RECONCILIATION_TERMINAL, T, '--', ...prior))).toEqual(
      [],
    );
    expect(
      changedInEntryPoint()
        .filter((p) => p.startsWith('docs/') && !prior.includes(p))
        .sort(),
    ).toEqual(recordsPresent ? [AUDIT, RECORD].sort() : []);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, A5, label, response or adjudication artifact', () => {
    expect(
      changedInEntryPoint().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST|CORPUS_FREEZE|A5_|LABELS?_|ADJUDICAT|RESPONSES_V|COMPLETED_RESPONSE|DRAFT|PROVISIONAL|LIVE_RESULT|LEDGER/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });

  it('the R52 human-review deferral record is byte-unchanged since R52, at the terminal and now', () => {
    if (!commitExists(R52_TERMINAL)) return;
    expect(atTerminal(R52_RELEASE)).toBe(git('show', `${R52_TERMINAL}:${R52_RELEASE}`));
    expect(read(R52_RELEASE)).toBe(git('show', `${R52_TERMINAL}:${R52_RELEASE}`));
  });

  it('no provider execution occurred and main was not updated by the slice', () => {
    const r = JSON.parse(atTerminal(RECORD)) as Record<string, unknown>;
    expect(r).toMatchObject({ liveClassificationExecutedDuringSlice: false, mainUpdated: false });
    // main never contains the slice.
    for (const ref of ['origin/main', 'main']) {
      try {
        git('rev-parse', '--verify', '--quiet', ref);
      } catch {
        continue;
      }
      expect(() => git('merge-base', '--is-ancestor', ENTRY_POINT_COMMITS[0]!, ref), ref).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// G. THE ENGINEERING RECORD.
// ---------------------------------------------------------------------------

describe.skipIf(!recordsPresent)(
  'classifier operator entry point: the record is a result, not an authority',
  () => {
    const record = (): Record<string, unknown> =>
      JSON.parse(atTerminal(RECORD)) as Record<string, unknown>;

    it('the entry-point record and audit are byte-identical to their terminal blobs', () => {
      for (const path of [RECORD, AUDIT]) {
        expect(read(path), path).toBe(atTerminal(path));
      }
    });

    it('names the canonical base, the command, the terminal and authorises nothing', () => {
      const r = record();
      expect(r['recordKind']).toBe('NON_EVALUATION_CLASSIFIER_OPERATOR_ENTRY_POINT_RESULT');
      expect(r['canonicalBase']).toMatchObject({ commit: RECONCILIATION_TERMINAL });
      expect(r['command']).toBe('nwf-pe orgunits classify');
      expect(r['scope']).toBe('ONE_EXPLICIT_ORGANISATION_ONE_EXPLICIT_RESEARCH_RUN');
      expect(r['requiredInputs']).toEqual(['organisationId', 'runId', 'modelId']);
      expect(r['thisFileAuthorises']).toEqual([]);
      expect(r['terminalState']).toBe('CLASSIFIER_OPERATOR_ENTRY_POINT_READY_FOR_READ_MODELS');
      expect(r['nextSlice']).toBe('CLASSIFIER_OPERATOR_READ_MODELS_V1');
    });

    it('declares every contract flag exactly', () => {
      expect(record()).toMatchObject({
        attemptDefault: 1,
        attemptAutoIncrement: false,
        modelDefault: null,
        latestRunSelection: false,
        dryRunProviderCalls: 0,
        researchRoleCompletionGate: true,
        classifierRoleExecution: true,
        completedReuse: true,
        nonCompletedAttemptRefusal: true,
        repairPolicy: 'DISABLED',
        classifierSemanticChange: false,
        migrationChange: false,
        liveClassificationExecutedDuringSlice: false,
        institutionNetworkAccess: false,
        humanEvaluationDependency: false,
        mainUpdated: false,
      });
    });

    it('names the exact changed production surface', () => {
      expect((record()['changedProductionSurface'] as string[]).slice().sort()).toEqual(
        AUTHORISED_PRODUCTION_FILES,
      );
    });

    it('claims no accuracy, precision, recall, kappa or empirical validation', () => {
      const body = `${atTerminal(RECORD)}\n${atTerminal(AUDIT)}`;
      for (const claim of [
        /"accuracy"\s*:/i,
        /"precision"\s*:/i,
        /"recall"\s*:/i,
        /"kappa"\s*:/i,
        /gold-certified/i,
      ]) {
        expect(body, String(claim)).not.toMatch(claim);
      }
    });
  },
);

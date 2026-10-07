/**
 * CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1 — the engine-owned machine
 * contract around the landed classifier action and reads, proven without a
 * database and without any provider:
 *
 *   A. the contract itself: one version, a closed operation set, every code
 *      bound to one outcome and every outcome to one exit status; one
 *      constructor; typed plan refusals mapped by CLASS, never by message;
 *   B. the action's pool-less refusals under --json: exactly one envelope on
 *      stdout, the right code and argument, zero pools, no provider;
 *   C. the reads' pool-less refusals and not-found / success wrapping;
 *   D. the real router: CLI usage rejection and a malformed --limit are
 *      envelopes for `orgunits classify ... --json`, and every other
 *      command keeps the landed behaviour;
 *   E. an unexpected exception fails closed as INTERNAL_ERROR and never
 *      serialises its message, while human mode still propagates it;
 *   F. the contract module is pure and the slice adds no HTTP, server,
 *      framework, socket or Operator-repository surface;
 *   G. changed surface since the read-model terminal: exactly the authorised
 *      contract surface; no classifier semantic, migration, grant, firewall,
 *      provider, web or evaluation byte;
 *   H. the engineering record is a result, not an authority.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import {
  executeClassifyCommand,
  type ClassifyDependencies,
  type ClassifyOptions,
} from '../../cli/commands/classify.js';
import {
  CLASSIFY_READ_ALLOWED_OPTIONS,
  executeClassifyReadCommand,
  type ClassifyReadDependencies,
  type ClassifyReadOptions,
} from '../../cli/commands/classifyRead.js';
import { main } from '../../cli/index.js';
import {
  MalformedSignalError,
  MissingResponseShaError,
  OrganisationNotFoundError,
  OrganisationRunMismatchError,
  PayloadBoundExceededError,
  ResearchRunNotFoundError,
  RunNotCompletedError,
  UnexpectedTrackValueError,
} from '../../orgunits/classify/errors.js';
import {
  CLASSIFIER_ASSEMBLY_REFUSAL_CODES,
  CLASSIFIER_OPERATOR_CODES,
  CLASSIFIER_OPERATOR_CONTRACT_VERSION,
  CLASSIFIER_OPERATOR_EXIT_CODES,
  CLASSIFIER_OPERATOR_OPERATIONS,
  buildClassifierOperatorEnvelope,
  classifierOperatorExitCode,
  classifierPlanFailure,
  renderClassifierOperatorEnvelope,
  type ClassifierOperatorEnvelope,
} from '../../orgunits/classify/operatorContract.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import { FORBIDDEN_AUTH_VARIABLES } from '../../orgunits/classify/provider/authConflicts.js';
import { REPAIR_POLICY_DISABLED } from '../../orgunits/classify/repair.js';
import { CLASSIFIER_OPERATOR_REPAIR_POLICY } from '../../cli/commands/classify.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CLASSIFIER_OPERATOR_READ_MODELS_TERMINAL = 'f4c747ec4d0427af22c48640ccb6924f9810ed58';
const R = CLASSIFIER_OPERATOR_READ_MODELS_TERMINAL;
const R52_TERMINAL = 'b1dfd82542e7dfb749d5c36063ea750647428a12';

const CONTRACT = 'src/orgunits/classify/operatorContract.ts';
const EXEC_CLI = 'src/cli/commands/classify.ts';
const READ_CLI = 'src/cli/commands/classifyRead.ts';
const CLI_INDEX = 'src/cli/index.ts';
const READ_MODEL = 'src/orgunits/classify/operatorReadModels.ts';
const PROVIDER_WIRING = 'src/cli/commands/classifyProvider.ts';
const FIREWALL = 'src/test/firewall/phase2b.firewall.test.ts';
const READ_MODELS_TEST = 'src/test/unit/classifierOperatorReadModelsV1.test.ts';
const ENTRY_POINT_INTEGRATION = 'src/test/integration/classifierOperatorEntryPoint.test.ts';
const READ_MODELS_INTEGRATION = 'src/test/integration/classifierOperatorReadModels.test.ts';
const THIS_TEST = 'src/test/unit/classifierOperatorControlPlaneContractV1.test.ts';
const INTEGRATION_TEST = 'src/test/integration/classifierOperatorControlPlaneContract.test.ts';
const RECORD = 'docs/evaluation/PHASE_2B_2D_CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1.md';
const R52_RELEASE =
  'docs/evaluation/PHASE_2B_2D_A4_R52_HUMAN_REVIEW_DEFERRAL_AND_ENGINEERING_RELEASE_V1.json';

/** The exact production surface this slice is authorised to touch. */
const AUTHORISED_PRODUCTION_FILES = [CONTRACT, EXEC_CLI, READ_CLI, CLI_INDEX].sort();

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const CALL = '33333333-3333-4333-8333-333333333333';
const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
const SECRET = 'postgres://zz-user:zz-secret-sentinel@zz-host/zz';

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

const terminalAvailable = commitExists(R);
const recordsPresent = [RECORD, AUDIT].every((p) => existsSync(join(REPO_ROOT, p)));

/** Every path changed since the read-model terminal, committed or not. */
function changedSinceTerminal(): string[] {
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', R)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

/** Exactly one JSON document, the whole of stdout. */
function envelope(stdout: string): ClassifierOperatorEnvelope<Record<string, unknown>> {
  expect(stdout.startsWith('{') && stdout.endsWith('}\n'), stdout).toBe(true);
  const parsed = JSON.parse(stdout) as ClassifierOperatorEnvelope<Record<string, unknown>>;
  expect(parsed.contractVersion).toBe(CLASSIFIER_OPERATOR_CONTRACT_VERSION);
  expect(parsed.outcome).toBe(CLASSIFIER_OPERATOR_CODES[parsed.code]);
  expect(parsed.exitCode).toBe(classifierOperatorExitCode(parsed.code));
  return parsed;
}

// ---------------------------------------------------------------------------
// A. THE CONTRACT.
// ---------------------------------------------------------------------------

describe('classifier operator contract V1: the contract itself', () => {
  it('names exactly one version, five operations and five outcomes', () => {
    expect(CLASSIFIER_OPERATOR_CONTRACT_VERSION).toBe('nwf-pe.classifier-operator.v1');
    expect([...CLASSIFIER_OPERATOR_OPERATIONS]).toEqual([
      'CLASSIFY',
      'CLASSIFY_RUNS',
      'CLASSIFY_CALLS',
      'CLASSIFY_SHOW',
      'UNRESOLVED',
    ]);
    expect(CLASSIFIER_OPERATOR_EXIT_CODES).toEqual({
      SUCCEEDED: 0,
      REFUSED: 1,
      NOT_FOUND: 1,
      NOT_COMPLETED: 1,
      FAILED: 1,
    });
    expect(Object.isFrozen(CLASSIFIER_OPERATOR_EXIT_CODES)).toBe(true);
    expect(Object.isFrozen(CLASSIFIER_OPERATOR_CODES)).toBe(true);
  });

  it('binds every stable code to exactly one outcome (the V1 taxonomy, pinned)', () => {
    expect(CLASSIFIER_OPERATOR_CODES).toEqual({
      DRY_RUN_EXECUTION_PERMITTED: 'SUCCEEDED',
      DRY_RUN_NO_CANDIDATES: 'SUCCEEDED',
      DRY_RUN_EXECUTION_NOT_PERMITTED: 'REFUSED',
      EXECUTE_COMPLETED: 'SUCCEEDED',
      EXECUTE_NO_CANDIDATES: 'SUCCEEDED',
      EXECUTE_NOT_COMPLETED: 'NOT_COMPLETED',
      ATTEMPT_ALREADY_EXISTS_NON_COMPLETED: 'REFUSED',
      RUNTIME_RESULT_MISMATCH: 'FAILED',
      PREFLIGHT_REFUSED: 'REFUSED',
      RESEARCH_RUN_NOT_COMPLETED: 'REFUSED',
      RESEARCH_RUN_NOT_FOUND: 'NOT_FOUND',
      CLASSIFIER_ASSEMBLY_REFUSED: 'REFUSED',
      READ_SUCCEEDED: 'SUCCEEDED',
      CALL_NOT_FOUND: 'NOT_FOUND',
      UNKNOWN_READ_SUBCOMMAND: 'REFUSED',
      UNEXPECTED_POSITIONAL: 'REFUSED',
      OPTION_NOT_ACCEPTED: 'REFUSED',
      ORGANISATION_NOT_FOUND: 'NOT_FOUND',
      INVALID_ARGUMENT: 'REFUSED',
      CLI_USAGE_REJECTED: 'REFUSED',
      INTERNAL_ERROR: 'FAILED',
    });
  });

  it('the one constructor derives outcome and exit status from the code; the renderer emits one document', () => {
    for (const code of Object.keys(
      CLASSIFIER_OPERATOR_CODES,
    ) as (keyof typeof CLASSIFIER_OPERATOR_CODES)[]) {
      const e = buildClassifierOperatorEnvelope('CLASSIFY', code);
      expect(e).toEqual({
        contractVersion: CLASSIFIER_OPERATOR_CONTRACT_VERSION,
        operation: 'CLASSIFY',
        outcome: CLASSIFIER_OPERATOR_CODES[code],
        code,
        exitCode: CLASSIFIER_OPERATOR_CODES[code] === 'SUCCEEDED' ? 0 : 1,
        data: null,
        reason: null,
      });
      const text = renderClassifierOperatorEnvelope(e);
      expect(text.endsWith('}\n')).toBe(true);
      expect(text.split('\n').filter((l) => l === '}')).toHaveLength(1);
      expect(JSON.parse(text)).toEqual(e);
    }
  });

  it('maps every typed plan refusal by CLASS and never reads or forwards its message', () => {
    const cases: [Error, string, Record<string, unknown>][] = [
      [new OrganisationNotFoundError(ORG), 'ORGANISATION_NOT_FOUND', { organisationId: ORG }],
      [new ResearchRunNotFoundError(RUN), 'RESEARCH_RUN_NOT_FOUND', { runId: RUN }],
      [
        new RunNotCompletedError(RUN, 'FAILED'),
        'CLASSIFIER_ASSEMBLY_REFUSED',
        { assemblyRefusalCode: 'RUN_NOT_COMPLETED' },
      ],
      [
        new OrganisationRunMismatchError(ORG, RUN, SECRET, [SECRET]),
        'CLASSIFIER_ASSEMBLY_REFUSED',
        { assemblyRefusalCode: 'ORGANISATION_RUN_MISMATCH' },
      ],
      [
        new UnexpectedTrackValueError('c', SECRET),
        'CLASSIFIER_ASSEMBLY_REFUSED',
        { assemblyRefusalCode: 'UNEXPECTED_TRACK_VALUE' },
      ],
      [
        new MissingResponseShaError('c', 'p'),
        'CLASSIFIER_ASSEMBLY_REFUSED',
        { assemblyRefusalCode: 'MISSING_RESPONSE_SHA' },
      ],
      [
        new PayloadBoundExceededError(`https://x.example/${SECRET}`, 9),
        'CLASSIFIER_ASSEMBLY_REFUSED',
        { assemblyRefusalCode: 'PAYLOAD_BOUND_EXCEEDED' },
      ],
      [
        new MalformedSignalError('c', SECRET),
        'CLASSIFIER_ASSEMBLY_REFUSED',
        { assemblyRefusalCode: 'MALFORMED_SIGNAL' },
      ],
    ];
    const mapped = new Set<string>();
    for (const [error, expectedCode, fields] of cases) {
      const failure = classifierPlanFailure(error);
      expect(failure?.code, error.name).toBe(expectedCode);
      expect(failure?.reason, error.name).toMatchObject(fields);
      expect(JSON.stringify(failure)).not.toContain('zz-secret-sentinel');
      const refusal = (failure?.reason as { assemblyRefusalCode?: string }).assemblyRefusalCode;
      if (refusal !== undefined) mapped.add(refusal);
    }
    expect([...mapped].sort()).toEqual([...CLASSIFIER_ASSEMBLY_REFUSAL_CODES].sort());
    // Anything untyped is not a refusal the contract can name.
    expect(classifierPlanFailure(new Error(SECRET))).toBeNull();
    expect(classifierPlanFailure(SECRET)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. THE ACTION, POOL-LESS.
// ---------------------------------------------------------------------------

interface ActionHarness {
  deps: ClassifyDependencies;
  stdout: () => string;
  stderr: () => string;
  pools: () => number;
  providers: () => number;
}

/** Pools and provider all THROW: a refusal must happen before any of them. */
function poollessAction(
  env: Readonly<Record<string, string | undefined>> = { HOME: '/zz-home' },
  research?: (fn: (pool: pg.Pool) => Promise<unknown>) => Promise<unknown>,
  classifier?: (fn: (pool: pg.Pool) => Promise<unknown>) => Promise<unknown>,
): ActionHarness {
  let stdout = '';
  let stderr = '';
  let pools = 0;
  let providers = 0;
  return {
    deps: {
      withResearchPool: ((fn: (pool: pg.Pool) => Promise<unknown>) => {
        pools += 1;
        return research ? research(fn) : Promise.reject(new Error('research pool reached'));
      }) as ClassifyDependencies['withResearchPool'],
      withClassifierPool: ((fn: (pool: pg.Pool) => Promise<unknown>) => {
        pools += 1;
        return classifier ? classifier(fn) : Promise.reject(new Error('classifier pool reached'));
      }) as ClassifyDependencies['withClassifierPool'],
      env,
      repoRoot: '/zz-repo',
      createProvider: () => {
        providers += 1;
        return Promise.reject(new Error('provider reached'));
      },
      stdout: (t) => {
        stdout += t;
      },
      stderr: (t) => {
        stderr += t;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
    pools: () => pools,
    providers: () => providers,
  };
}

/** An undefined override REMOVES that option, as an operator who never typed it. */
function action(overrides: Record<string, string | boolean | undefined> = {}): ClassifyOptions {
  const merged: Record<string, unknown> = {
    organisationId: ORG,
    runId: RUN,
    model: MODEL,
    execute: false,
    json: true,
    ...overrides,
  };
  for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
  return merged as unknown as ClassifyOptions;
}

/** A pg.Pool stand-in answering every query with `rows`. */
const poolAnswering = (rows: unknown[]): pg.Pool =>
  ({ query: () => Promise.resolve({ rows }) }) as unknown as pg.Pool;

describe('classifier operator contract V1: action refusals are envelopes', () => {
  it.each([
    [{ organisationId: undefined }, 'organisation-id', 'MISSING'],
    [{ organisationId: 'F PARIS001' }, 'organisation-id', 'MALFORMED'],
    [{ runId: undefined }, 'run-id', 'MISSING'],
    [{ runId: 'latest' }, 'run-id', 'MALFORMED'],
    [{ model: undefined }, 'model', 'MISSING'],
    [{ attempt: '0' }, 'attempt', 'MALFORMED'],
    [{ attempt: 'next' }, 'attempt', 'MALFORMED'],
    [{ malformedLimit: 'abc' }, 'limit', 'MALFORMED'],
  ] as const)(
    '%o is INVALID_ARGUMENT %s/%s with zero pools',
    async (overrides, argument, problem) => {
      for (const execute of [false, true]) {
        const h = poollessAction();
        const exit = await executeClassifyCommand(action({ ...overrides, execute }), h.deps);
        expect(exit).toBe(1);
        expect(envelope(h.stdout())).toMatchObject({
          operation: 'CLASSIFY',
          outcome: 'REFUSED',
          code: 'INVALID_ARGUMENT',
          exitCode: 1,
          data: null,
          reason: { kind: 'INVALID_ARGUMENT', argument, problem },
        });
        expect(h.pools()).toBe(0);
        expect(h.providers()).toBe(0);
      }
    },
  );

  it('an unknown model is PREFLIGHT_REFUSED in BOTH modes, before any pool', async () => {
    for (const execute of [false, true]) {
      const h = poollessAction();
      expect(
        await executeClassifyCommand(action({ model: 'zz-not-a-model', execute }), h.deps),
      ).toBe(1);
      expect(envelope(h.stdout())).toMatchObject({
        code: 'PREFLIGHT_REFUSED',
        reason: { kind: 'PREFLIGHT_REFUSED', preflightKind: 'MODEL_NOT_ALLOWED' },
      });
      expect(h.pools()).toBe(0);
    }
  });

  it('a conflicting auth variable refuses --execute before any pool and never echoes its value', async () => {
    const variable = FORBIDDEN_AUTH_VARIABLES[0]!;
    const h = poollessAction({ HOME: '/zz-home', [variable]: SECRET });
    expect(await executeClassifyCommand(action({ execute: true }), h.deps)).toBe(1);
    const e = envelope(h.stdout());
    expect(e).toMatchObject({ code: 'PREFLIGHT_REFUSED' });
    expect(e.reason).toMatchObject({ preflightKind: 'CONFLICTING_AUTH_VARIABLES' });
    expect(h.stdout()).not.toContain('zz-secret-sentinel');
    expect(h.stdout()).not.toContain('/zz-home');
    expect(h.pools()).toBe(0);
  });

  it('a non-completed research run is RESEARCH_RUN_NOT_COMPLETED and the classifier pool is never opened', async () => {
    const h = poollessAction({ HOME: '/zz-home' }, (fn) =>
      fn(poolAnswering([{ terminal_state: 'ABORTED', error_kind: 'OTHER' }])),
    );
    expect(await executeClassifyCommand(action({ execute: true }), h.deps)).toBe(1);
    expect(envelope(h.stdout())).toMatchObject({
      code: 'RESEARCH_RUN_NOT_COMPLETED',
      reason: { runId: RUN, researchRunStatus: 'ABORTED', researchRunErrorKind: 'OTHER' },
    });
    expect(h.pools()).toBe(1);
    expect(h.providers()).toBe(0);
  });

  it('an organisation the landed loader cannot find is ORGANISATION_NOT_FOUND', async () => {
    const h = poollessAction(
      { HOME: '/zz-home' },
      (fn) => fn(poolAnswering([{ terminal_state: 'COMPLETED', error_kind: null }])),
      (fn) => fn(poolAnswering([])),
    );
    expect(await executeClassifyCommand(action({ execute: true }), h.deps)).toBe(1);
    expect(envelope(h.stdout())).toMatchObject({
      outcome: 'NOT_FOUND',
      code: 'ORGANISATION_NOT_FOUND',
      reason: { organisationId: ORG },
    });
    expect(h.providers()).toBe(0);
  });

  it('machine stdout carries no human prefix; the landed diagnostic stays on stderr, outside the contract', async () => {
    const h = poollessAction();
    await executeClassifyCommand(action({ runId: undefined }), h.deps);
    expect(h.stdout()).not.toMatch(/ERROR|error:/);
    expect(h.stderr()).toMatch(/^ERROR orgunits classify requires --run-id <uuid>\./);
  });

  it('human mode is byte-compatible: the same refusals print the landed text and no JSON', async () => {
    for (const [overrides, text] of [
      [
        { organisationId: undefined },
        'ERROR orgunits classify requires --organisation-id <uuid>.\n',
      ],
      [{ attempt: '0' }, 'ERROR --attempt must be a positive integer (>= 1); received "0".\n'],
      [{ malformedLimit: '0' }, 'ERROR --limit must be a positive integer, got 0\n'],
    ] as const) {
      const h = poollessAction();
      expect(await executeClassifyCommand(action({ ...overrides, json: false }), h.deps)).toBe(1);
      expect(h.stdout()).toBe('');
      expect(h.stderr()).toBe(text);
    }
  });
});

// ---------------------------------------------------------------------------
// C. THE READS, POOL-LESS.
// ---------------------------------------------------------------------------

function readHarness(answer?: unknown): {
  deps: ClassifyReadDependencies;
  stdout: () => string;
  uses: () => number;
} {
  let stdout = '';
  let uses = 0;
  return {
    deps: {
      withReadonlyPool: (() => {
        uses += 1;
        return answer === undefined
          ? Promise.reject(new Error('readonly pool reached'))
          : Promise.resolve(answer);
      }) as ClassifyReadDependencies['withReadonlyPool'],
      stdout: (t) => {
        stdout += t;
      },
      stderr: () => undefined,
    },
    stdout: () => stdout,
    uses: () => uses,
  };
}

function readOptions(overrides: Partial<ClassifyReadOptions>): ClassifyReadOptions {
  return { positionals: ['runs'], suppliedOptions: ['json'], json: true, ...overrides };
}

describe('classifier operator contract V1: read outcomes are envelopes', () => {
  it.each([
    [{ positionals: ['nonsense'] }, 'UNRESOLVED', 'UNKNOWN_READ_SUBCOMMAND'],
    [{ positionals: [] }, 'UNRESOLVED', 'UNKNOWN_READ_SUBCOMMAND'],
    [{ positionals: ['runs', 'extra'] }, 'CLASSIFY_RUNS', 'UNEXPECTED_POSITIONAL'],
    [{ positionals: ['runs'] }, 'CLASSIFY_RUNS', 'INVALID_ARGUMENT'],
    [
      { positionals: ['show'], callId: 'latest', suppliedOptions: ['call-id'] },
      'CLASSIFY_SHOW',
      'INVALID_ARGUMENT',
    ],
    [
      {
        positionals: ['calls'],
        organisationId: ORG,
        runId: 'x',
        suppliedOptions: ['organisation-id', 'run-id'],
      },
      'CLASSIFY_CALLS',
      'INVALID_ARGUMENT',
    ],
    [
      {
        positionals: ['runs'],
        organisationId: ORG,
        suppliedOptions: ['organisation-id', 'execute'],
      },
      'CLASSIFY_RUNS',
      'OPTION_NOT_ACCEPTED',
    ],
    [
      { positionals: ['show'], callId: CALL, suppliedOptions: ['call-id', 'limit', 'model'] },
      'CLASSIFY_SHOW',
      'OPTION_NOT_ACCEPTED',
    ],
    [
      { positionals: ['runs'], organisationId: ORG, malformedLimit: '-1' },
      'CLASSIFY_RUNS',
      'INVALID_ARGUMENT',
    ],
  ] as const)('%o -> %s %s with zero pools', async (overrides, operation, code) => {
    const h = readHarness();
    expect(await executeClassifyReadCommand(readOptions(overrides), h.deps)).toBe(1);
    expect(envelope(h.stdout())).toMatchObject({ operation, code, outcome: 'REFUSED', data: null });
    expect(h.uses()).toBe(0);
  });

  it('an option refusal names option NAMES only, sorted, with the accepted set', async () => {
    const h = readHarness();
    await executeClassifyReadCommand(
      readOptions({
        positionals: ['show'],
        callId: CALL,
        suppliedOptions: ['model', 'call-id', 'attempt'],
      }),
      h.deps,
    );
    expect(envelope(h.stdout()).reason).toEqual({
      kind: 'OPTION_NOT_ACCEPTED',
      refusedOptions: ['attempt', 'model'],
      acceptedOptions: CLASSIFY_READ_ALLOWED_OPTIONS.show,
    });
  });

  it('null from the read model is ORGANISATION_NOT_FOUND / CALL_NOT_FOUND; a value is READ_SUCCEEDED with it unchanged under data', async () => {
    for (const positionals of [['runs'], ['calls']]) {
      const h = readHarness(null);
      await executeClassifyReadCommand(
        readOptions({ positionals, organisationId: ORG, suppliedOptions: ['organisation-id'] }),
        h.deps,
      );
      expect(envelope(h.stdout())).toMatchObject({
        code: 'ORGANISATION_NOT_FOUND',
        outcome: 'NOT_FOUND',
        reason: { kind: 'ORGANISATION_NOT_FOUND', organisationId: ORG },
      });
    }
    const missing = readHarness(null);
    await executeClassifyReadCommand(
      readOptions({ positionals: ['show'], callId: CALL, suppliedOptions: ['call-id'] }),
      missing.deps,
    );
    expect(envelope(missing.stdout())).toMatchObject({
      operation: 'CLASSIFY_SHOW',
      code: 'CALL_NOT_FOUND',
      reason: { callId: CALL },
    });
    const model = {
      kind: 'CLASSIFIER_CALLS',
      organisationId: ORG,
      runId: null,
      limit: 50,
      calls: [],
    };
    const found = readHarness(model);
    expect(
      await executeClassifyReadCommand(
        readOptions({
          positionals: ['calls'],
          organisationId: ORG,
          suppliedOptions: ['organisation-id'],
        }),
        found.deps,
      ),
    ).toBe(0);
    expect(envelope(found.stdout())).toEqual({
      contractVersion: CLASSIFIER_OPERATOR_CONTRACT_VERSION,
      operation: 'CLASSIFY_CALLS',
      outcome: 'SUCCEEDED',
      code: 'READ_SUCCEEDED',
      exitCode: 0,
      data: model,
      reason: null,
    });
  });
});

// ---------------------------------------------------------------------------
// D. THE REAL ROUTER.
// ---------------------------------------------------------------------------

describe('classifier operator contract V1: the real router', () => {
  let stdout = '';
  let stderr = '';
  afterEach(() => {
    vi.restoreAllMocks();
    stdout = '';
    stderr = '';
  });
  function capture(): void {
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
  }

  it('a strict-parse rejection of `orgunits classify ... --json` is one CLI_USAGE_REJECTED envelope', async () => {
    capture();
    expect(await main(['orgunits', 'classify', '--not-an-option', '--json'])).toBe(1);
    expect(envelope(stdout)).toMatchObject({
      operation: 'UNRESOLVED',
      code: 'CLI_USAGE_REJECTED',
      reason: { kind: 'CLI_USAGE_REJECTED' },
      data: null,
    });
    expect(stderr).toMatch(/^ERROR /);
  });

  it('without --json, and for every other command, a strict-parse rejection still throws as landed', async () => {
    capture();
    await expect(main(['orgunits', 'classify', '--not-an-option'])).rejects.toThrow();
    await expect(main(['orgs', 'list', '--not-an-option', '--json'])).rejects.toThrow();
    expect(stdout).toBe('');
  });

  it('a malformed --limit is an INVALID_ARGUMENT envelope on both classifier routes, before any pool', async () => {
    for (const argv of [
      ['orgunits', 'classify', 'runs', '--organisation-id', ORG, '--limit', 'abc', '--json'],
      ['orgunits', 'classify', 'calls', '--organisation-id', ORG, '--limit', '0', '--json'],
      [
        'orgunits',
        'classify',
        '--organisation-id',
        ORG,
        '--run-id',
        RUN,
        '--model',
        MODEL,
        '--limit',
        'none',
        '--json',
      ],
    ]) {
      capture();
      expect(await main(argv)).toBe(1);
      expect(envelope(stdout)).toMatchObject({
        code: 'INVALID_ARGUMENT',
        reason: { argument: 'limit', problem: 'MALFORMED' },
      });
      vi.restoreAllMocks();
      stdout = '';
      stderr = '';
    }
  });

  it('a malformed --limit keeps the landed text in human mode, and other commands keep the shared rule', async () => {
    capture();
    expect(
      await main(['orgunits', 'classify', 'runs', '--organisation-id', ORG, '--limit', 'x']),
    ).toBe(1);
    expect(stderr).toBe('ERROR --limit must be a positive integer, got x\n');
    expect(stdout).toBe('');
    stderr = '';
    expect(await main(['orgs', 'list', '--limit', '0'])).toBe(1);
    expect(stderr).toBe('ERROR --limit must be a positive integer, got 0\n');
  });

  it('an unknown read subcommand and a missing action argument are envelopes through the router', async () => {
    capture();
    expect(await main(['orgunits', 'classify', 'latest', '--json'])).toBe(1);
    expect(envelope(stdout)).toMatchObject({
      operation: 'UNRESOLVED',
      code: 'UNKNOWN_READ_SUBCOMMAND',
    });
    stdout = '';
    expect(await main(['orgunits', 'classify', '--organisation-id', ORG, '--json'])).toBe(1);
    expect(envelope(stdout)).toMatchObject({
      operation: 'CLASSIFY',
      code: 'INVALID_ARGUMENT',
      reason: { argument: 'run-id', problem: 'MISSING' },
    });
  });
});

// ---------------------------------------------------------------------------
// E. UNEXPECTED FAILURES FAIL CLOSED.
// ---------------------------------------------------------------------------

describe('classifier operator contract V1: unexpected failures fail closed', () => {
  const boom = (): Promise<never> => Promise.reject(new Error(`connect failed: ${SECRET}`));

  it('an action exception under --json is INTERNAL_ERROR before execution, with no message in the envelope', async () => {
    const h = poollessAction({ HOME: '/zz-home' }, boom);
    expect(await executeClassifyCommand(action(), h.deps)).toBe(1);
    const e = envelope(h.stdout());
    expect(e).toEqual({
      contractVersion: CLASSIFIER_OPERATOR_CONTRACT_VERSION,
      operation: 'CLASSIFY',
      outcome: 'FAILED',
      code: 'INTERNAL_ERROR',
      exitCode: 1,
      data: null,
      reason: {
        kind: 'INTERNAL_ERROR',
        stage: 'BEFORE_EXECUTION',
        classifierWritesMayHaveOccurred: false,
      },
    });
    expect(h.stdout()).not.toContain('zz-secret-sentinel');
    expect(h.stdout()).not.toMatch(/stack|Error:|at .*\.ts/);
  });

  it('an untyped planning failure is INTERNAL_ERROR in machine mode and the landed assembly refusal in human mode', async () => {
    const research = (fn: (pool: pg.Pool) => Promise<unknown>): Promise<unknown> =>
      fn(poolAnswering([{ terminal_state: 'COMPLETED', error_kind: null }]));
    const machine = poollessAction({ HOME: '/zz-home' }, research, boom);
    expect(await executeClassifyCommand(action(), machine.deps)).toBe(1);
    expect(envelope(machine.stdout())).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(machine.stdout()).not.toContain('zz-secret-sentinel');

    const human = poollessAction({ HOME: '/zz-home' }, research, (fn) =>
      fn({ query: () => Promise.reject(new Error('untyped')) } as unknown as pg.Pool),
    );
    expect(await executeClassifyCommand(action({ json: false }), human.deps)).toBe(1);
    expect(human.stderr()).toBe('ERROR classifier assembly refused (Error): untyped\n');
  });

  it('human mode still propagates an unexpected exception exactly as landed', async () => {
    const h = poollessAction({ HOME: '/zz-home' }, boom);
    await expect(executeClassifyCommand(action({ json: false }), h.deps)).rejects.toThrow(
      'connect failed',
    );
    expect(h.stdout()).toBe('');
  });

  it('a read exception under --json is INTERNAL_ERROR with no write possible and no message', async () => {
    let stdout = '';
    const exit = await executeClassifyReadCommand(
      readOptions({
        positionals: ['runs'],
        organisationId: ORG,
        suppliedOptions: ['organisation-id'],
      }),
      {
        withReadonlyPool: boom,
        stdout: (t) => {
          stdout += t;
        },
        stderr: () => undefined,
      },
    );
    expect(exit).toBe(1);
    expect(envelope(stdout)).toMatchObject({
      operation: 'CLASSIFY_RUNS',
      code: 'INTERNAL_ERROR',
      reason: { stage: 'BEFORE_EXECUTION', classifierWritesMayHaveOccurred: false },
    });
    expect(stdout).not.toContain('zz-secret-sentinel');
  });
});

// ---------------------------------------------------------------------------
// F. PURITY, NO HTTP, NO OPERATOR REPOSITORY.
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

describe('classifier operator contract V1: pure, no HTTP, no Operator repository', () => {
  it('the contract module imports only the typed classifier errors, and errors.ts imports nothing', () => {
    expect([...importClosure(CONTRACT)].sort()).toEqual(
      [CONTRACT, 'src/orgunits/classify/errors.ts'].sort(),
    );
    const source = code(CONTRACT);
    expect([...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1])).toEqual([
      './errors.js',
    ]);
    expect(source).not.toMatch(/process\.env|Date\.now\(|new Date\(|Math\.random\(|\bimport\s*\(/);
    expect(source).not.toMatch(/\bpool\b|\bquery\s*\(|SELECT|INSERT|UPDATE|DELETE/);
    expect(source).not.toMatch(/\.message\b|\.stack\b/);
  });

  it('the read commands reach exactly the landed read closure plus the contract and its errors', () => {
    expect([...importClosure(READ_CLI)].sort()).toEqual(
      [
        READ_CLI,
        READ_MODEL,
        CONTRACT,
        'src/orgunits/classify/errors.ts',
        'src/orgunits/classify/constants.ts',
        'src/db/client.ts',
        'src/config/env.ts',
      ].sort(),
    );
  });

  it('no changed production file opens a socket, a listener, a server or an HTTP framework', () => {
    const changed = terminalAvailable
      ? changedSinceTerminal().filter((p) => p.startsWith('src/') && !p.startsWith('src/test/'))
      : AUTHORISED_PRODUCTION_FILES;
    for (const file of changed) {
      const source = code(file);
      expect(source, file).not.toMatch(/from\s+['"]node:(net|tls|http|https|http2|dns|dgram)['"]/);
      expect(source, file).not.toMatch(
        /from\s+['"](fastify|express|koa|@hapi\/hapi|hono|@nestjs\/[^'"]+|graphql|apollo-server|ws|socket\.io)['"]/,
      );
      expect(source, file).not.toMatch(/createServer\s*\(|\.listen\s*\(|\bfetch\s*\(/);
      expect(source, file).not.toMatch(/\bapp\.(get|post|put|delete|route)\s*\(/);
    }
  });

  it('no file this slice adds or changes under src/ depends on the sibling Operator repository', () => {
    const changed = terminalAvailable ? changedSinceTerminal() : [];
    for (const file of changed.filter((p) => p.startsWith('src/') && p !== THIS_TEST)) {
      expect(read(file), file).not.toMatch(/nwf-partnership-engine-ui|engine-ui\//);
    }
    expect(read('package.json')).not.toMatch(/nwf-partnership-engine-ui|"file:\.\.\//);
  });

  it('repair stays DISABLED and the runtime still composes fetch policy v7', () => {
    expect(CLASSIFIER_OPERATOR_REPAIR_POLICY).toBe(REPAIR_POLICY_DISABLED);
    expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v7');
  });
});

// ---------------------------------------------------------------------------
// G. CHANGED SURFACE SINCE THE READ-MODEL TERMINAL.
// ---------------------------------------------------------------------------

describe.skipIf(!terminalAvailable)('classifier operator contract V1: changed surface', () => {
  it('descends from the read-model terminal with single-parent commits, first freezing the read-model test', () => {
    expect(() => git('merge-base', '--is-ancestor', R, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${R}..HEAD`))).toEqual([]);
    const [first] = lines(git('rev-list', '--reverse', `${R}..HEAD`));
    if (first === undefined) return;
    expect(git('rev-parse', `${first}^`).trim()).toBe(R);
    expect(lines(git('diff', '--name-only', R, first))).toEqual([READ_MODELS_TEST]);
    expect(lines(git('log', '-1', '--format=%s', first))[0]).toMatch(
      /freeze classifier operator read-model scope/,
    );
  });

  it('changes production code exactly within the authorised contract surface', () => {
    const production = changedSinceTerminal().filter(
      (p) => p.startsWith('src/') && !p.startsWith('src/test/'),
    );
    expect(production.sort()).toEqual(AUTHORISED_PRODUCTION_FILES);
  });

  it('changes nothing outside that surface, its tests, the two envelope-reading integration suites, the read-model pin, the record and the audit', () => {
    const permitted = new Set([
      ...AUTHORISED_PRODUCTION_FILES,
      READ_MODELS_TEST,
      ENTRY_POINT_INTEGRATION,
      READ_MODELS_INTEGRATION,
      THIS_TEST,
      INTEGRATION_TEST,
      RECORD,
      AUDIT,
    ]);
    expect(changedSinceTerminal().filter((p) => !permitted.has(p))).toEqual([]);
  });

  it('the two landed integration suites changed ONLY to read the unchanged payload from the envelope', () => {
    for (const file of [ENTRY_POINT_INTEGRATION, READ_MODELS_INTEGRATION]) {
      const diff = lines(git('diff', '-U0', R, '--', file)).filter((l) => /^[+-][^+-]/.test(l));
      const removed = diff.filter((l) => l.startsWith('-'));
      expect(removed.length, file).toBeGreaterThan(0);
      for (const line of removed) expect(line, file).toMatch(/JSON\.parse\(/);
      const added = diff.filter((l) => l.startsWith('+')).join('\n');
      expect(added, file).toContain('function unwrap(text: string): unknown {');
      expect(added, file).toContain('CLASSIFIER_OPERATOR_CONTRACT_VERSION');
      expect(added, file).not.toMatch(/\.toBe\((0|1)\)/);
    }
  });

  it('leaves every classifier semantic file, the provider wiring, the read model and the firewall byte-identical', () => {
    for (const path of [
      PROVIDER_WIRING,
      READ_MODEL,
      FIREWALL,
      'src/orgunits/classify/persist.ts',
      'src/orgunits/classify/orchestrate.ts',
      'src/orgunits/classify/operatorPlan.ts',
      'src/orgunits/classify/callIdentity.ts',
      'src/orgunits/classify/prompt.ts',
      'src/orgunits/classify/outputSchema.ts',
      'src/orgunits/classify/validate.ts',
      'src/orgunits/classify/repair.ts',
      'src/orgunits/classify/constants.ts',
      'src/orgunits/classify/errors.ts',
      'src/orgunits/classify/assemble.ts',
      'src/orgunits/classify/loaders.ts',
      'src/orgunits/classify/ordering.ts',
      'src/orgunits/classify/document.ts',
      'src/orgunits/classify/runStatus.ts',
      'src/orgunits/classify/provider/allowedModels.ts',
      'src/orgunits/classify/provider/preflight.ts',
      'src/orgunits/web/policy.ts',
      'src/orgunits/web/evidenceCanonical.ts',
      'src/orgunits/web/extract.ts',
      'src/orgunits/web/redact.ts',
      'package.json',
      'package-lock.json',
      'CLAUDE.md',
    ]) {
      expect(read(path), path).toBe(git('show', `${R}:${path}`));
    }
    expect(
      changedSinceTerminal().filter(
        (p) =>
          p.startsWith('src/orgunits/classify/provider/') ||
          p.startsWith('src/orgunits/classify/evaluation/') ||
          p.startsWith('src/orgunits/web/') ||
          p.startsWith('src/orgunits/orchestrator/') ||
          p.startsWith('src/orgunits/signals/') ||
          p.startsWith('src/test/firewall/') ||
          /^(migrations|scripts|docker|\.github)\//.test(p),
      ),
    ).toEqual([]);
  });

  it('the migration set is unchanged (0001-0012) and adds no grant', () => {
    const now = lines(git('ls-files', 'migrations'));
    expect(now).toEqual(lines(git('ls-tree', '-r', '--name-only', R, '--', 'migrations')));
    expect(now.at(-1)).toMatch(/^migrations\/0012_/);
    expect(lines(git('diff', '--name-only', R, '--', 'migrations'))).toEqual([]);
  });

  it('the execution action still wires the same roles, repair policy, configs and dynamic provider import', () => {
    const cli = code(EXEC_CLI);
    expect(cli.match(/withPool\(\s*'research'/g)).toHaveLength(1);
    expect(cli.match(/withPool\(\s*'classifier'/g)).toHaveLength(1);
    expect(cli).toContain('repairPolicy: CLASSIFIER_OPERATOR_REPAIR_POLICY');
    expect(cli).toContain("await import('./classifyProvider.js')");
    expect(code(READ_CLI).match(/withPool\(\s*'readonly'/g)).toHaveLength(1);
    // The contract slice adds no SQL anywhere in the CLI.
    for (const file of [EXEC_CLI, READ_CLI, CLI_INDEX, CONTRACT]) {
      expect(code(file), file).not.toMatch(
        /\bSELECT\s|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i,
      );
    }
  });

  it('modifies no existing document and adds only this record and audit under docs/', () => {
    const prior = lines(git('ls-tree', '-r', '--name-only', R, '--', 'docs'));
    expect(lines(git('diff', '--name-only', R, '--', ...prior))).toEqual([]);
    expect(
      changedSinceTerminal()
        .filter((p) => p.startsWith('docs/') && !prior.includes(p))
        .sort(),
    ).toEqual(recordsPresent ? [AUDIT, RECORD].sort() : []);
  });

  it('creates no DEV_CONFIRM, FINAL_HOLDOUT, gold, A5, label, response or adjudication artifact', () => {
    expect(
      changedSinceTerminal().filter((path) =>
        /DEV_CONFIRM|FINAL_HOLDOUT|GOLD_|MANIFEST|CORPUS_FREEZE|A5_|LABELS?_|ADJUDICAT|RESPONSES_V|COMPLETED_RESPONSE|DRAFT|PROVISIONAL|LIVE_RESULT|LEDGER/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });

  it('the R52 human-review deferral record is byte-unchanged since R52', () => {
    if (!commitExists(R52_TERMINAL)) return;
    expect(read(R52_RELEASE)).toBe(git('show', `${R52_TERMINAL}:${R52_RELEASE}`));
  });

  it('main does not contain this slice', () => {
    const [first] = lines(git('rev-list', '--reverse', `${R}..HEAD`));
    if (first === undefined) return;
    for (const ref of ['origin/main', 'main']) {
      try {
        git('rev-parse', '--verify', '--quiet', ref);
      } catch {
        continue;
      }
      expect(() => git('merge-base', '--is-ancestor', first, ref), ref).toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// H. THE ENGINEERING RECORD.
// ---------------------------------------------------------------------------

describe.skipIf(!recordsPresent)(
  'classifier operator contract V1: the record is a result, not an authority',
  () => {
    const record = (): Record<string, unknown> =>
      JSON.parse(read(RECORD)) as Record<string, unknown>;

    it('names the canonical base, the contract, the operations, the terminal and authorises nothing', () => {
      const r = record();
      expect(r['recordKind']).toBe(
        'NON_EVALUATION_CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_RESULT',
      );
      expect(r['canonicalBase']).toMatchObject({ commit: R });
      expect(r['contractVersion']).toBe(CLASSIFIER_OPERATOR_CONTRACT_VERSION);
      expect(r['supportedOperations']).toEqual([...CLASSIFIER_OPERATOR_OPERATIONS]);
      expect(r['codes']).toEqual(CLASSIFIER_OPERATOR_CODES);
      expect(r['exitCodes']).toEqual(CLASSIFIER_OPERATOR_EXIT_CODES);
      expect(r['thisFileAuthorises']).toEqual([]);
      expect(r['terminalState']).toBe(
        'CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_READY_FOR_OPERATOR_INTEGRATION',
      );
    });

    it('declares every boundary flag exactly', () => {
      expect(record()).toMatchObject({
        httpServer: false,
        operatorRepositoryModified: false,
        classifierSemanticChange: false,
        promptChange: false,
        outputSchemaChange: false,
        modelAllowlistChange: false,
        repairPolicyChange: false,
        candidateSelectionChange: false,
        fetchPolicyChange: false,
        migrationChange: false,
        grantChange: false,
        schemaChange: false,
        humanEvaluationDependency: false,
        devConfirmOpened: false,
        finalHoldoutOpened: false,
        a5Authorised: false,
        mainUpdated: false,
      });
    });

    it('names the exact changed production surface', () => {
      expect((record()['changedProductionSurface'] as string[]).slice().sort()).toEqual(
        AUTHORISED_PRODUCTION_FILES,
      );
    });

    it('claims no accuracy, precision, recall, kappa or empirical validation', () => {
      const body = `${read(RECORD)}\n${read(AUDIT)}`;
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

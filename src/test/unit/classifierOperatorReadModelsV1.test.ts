/**
 * CLASSIFIER_OPERATOR_READ_MODELS_V1 — the boundary of `nwf-pe orgunits
 * classify runs|calls|show`, proven without a database and without any
 * provider:
 *
 *   A. argument bounds: each read accepts exactly its own options, refuses
 *      every other one (--execute, --model, --attempt included), requires
 *      UUIDs, defaults --limit to 50; every refusal is pool-less;
 *   B. the REAL router: a third positional selects a read, an unknown one is
 *      refused and never reaches the execution action, and the execution
 *      action's own route is unchanged;
 *   C. the read model: readonly role only, SELECT only, deterministic order,
 *      SQL LIMIT, the existing rank cutoff and never a score;
 *   D. no provider, no web, no discovery, no execution path in the read
 *      commands' import graph;
 *   E. changed surface since the entry-point terminal: exactly the
 *      authorised read-model surface; no migration, grant, semantic,
 *      provider, web or evaluation byte;
 *   F. the engineering record is a result, not an authority.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSIFY_READ_ALLOWED_OPTIONS,
  executeClassifyReadCommand,
  isUuid,
  parseClassifyReadArguments,
  type ClassifyReadOptions,
} from '../../cli/commands/classifyRead.js';
import { main } from '../../cli/index.js';
import { MAX_CANDIDATES_PER_ROOT_TRACK } from '../../orgunits/classify/constants.js';
import {
  CLASSIFIER_READ_DEFAULT_LIMIT,
  RUN_ASSOCIATION_COVERAGE,
} from '../../orgunits/classify/operatorReadModels.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL = '2b9d0d9c94bda00bbe88758b2c207ecadc300934';
const R52_TERMINAL = 'b1dfd82542e7dfb749d5c36063ea750647428a12';
const T = CLASSIFIER_OPERATOR_ENTRY_POINT_TERMINAL;

const READ_MODEL = 'src/orgunits/classify/operatorReadModels.ts';
const READ_CLI = 'src/cli/commands/classifyRead.ts';
const CLI_INDEX = 'src/cli/index.ts';
const EXEC_CLI = 'src/cli/commands/classify.ts';
const PROVIDER_WIRING = 'src/cli/commands/classifyProvider.ts';
const PERSIST = 'src/orgunits/classify/persist.ts';
const ENTRY_POINT_TEST = 'src/test/unit/classifierOperatorEntryPointV1.test.ts';
const THIS_TEST = 'src/test/unit/classifierOperatorReadModelsV1.test.ts';
const INTEGRATION_TEST = 'src/test/integration/classifierOperatorReadModels.test.ts';
const FIREWALL = 'src/test/firewall/phase2b.firewall.test.ts';
const RECORD = 'docs/evaluation/PHASE_2B_2D_CLASSIFIER_OPERATOR_READ_MODELS_V1.json';
const AUDIT = 'docs/audits/PHASE_2B_2D_CLASSIFIER_OPERATOR_READ_MODELS_V1.md';
const R52_RELEASE =
  'docs/evaluation/PHASE_2B_2D_A4_R52_HUMAN_REVIEW_DEFERRAL_AND_ENGINEERING_RELEASE_V1.json';

/** The exact production surface this slice is authorised to touch. */
const AUTHORISED_PRODUCTION_FILES = [READ_MODEL, READ_CLI, CLI_INDEX].sort();

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const CALL = '33333333-3333-4333-8333-333333333333';

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

const terminalAvailable = commitExists(T);
const recordsPresent = [RECORD, AUDIT].every((p) => existsSync(join(REPO_ROOT, p)));

/** Every path changed since the entry-point terminal, committed or not. */
function changedSinceTerminal(): string[] {
  return [
    ...new Set([
      ...lines(git('diff', '--name-only', T)),
      ...lines(git('ls-files', '--others', '--exclude-standard')),
    ]),
  ];
}

function readOptions(overrides: Partial<ClassifyReadOptions>): ClassifyReadOptions {
  return { positionals: ['runs'], suppliedOptions: [], json: false, ...overrides };
}

/** A dependency set whose pool THROWS: any refusal must happen before it. */
function poolless(): {
  deps: Parameters<typeof executeClassifyReadCommand>[1];
  uses: () => number;
  out: () => string;
} {
  let uses = 0;
  let out = '';
  return {
    deps: {
      withReadonlyPool: () => {
        uses += 1;
        return Promise.reject(new Error('the readonly pool must not be reached in this test'));
      },
      stdout: (t) => {
        out += t;
      },
      stderr: (t) => {
        out += t;
      },
    },
    uses: () => uses,
    out: () => out,
  };
}

// ---------------------------------------------------------------------------
// A. ARGUMENT BOUNDS.
// ---------------------------------------------------------------------------

describe('classifier read models: argument bounds', () => {
  it('accepts exactly the approved option sets', () => {
    expect(CLASSIFY_READ_ALLOWED_OPTIONS).toEqual({
      runs: ['organisation-id', 'limit', 'json'],
      calls: ['organisation-id', 'run-id', 'limit', 'json'],
      show: ['call-id', 'json'],
    });
  });

  it('parses each read; --limit defaults to exactly 50 and is passed through otherwise', () => {
    expect(CLASSIFIER_READ_DEFAULT_LIMIT).toBe(50);
    expect(
      parseClassifyReadArguments(
        readOptions({ organisationId: ORG, suppliedOptions: ['organisation-id'] }),
      ),
    ).toEqual({ ok: true, value: { subcommand: 'runs', organisationId: ORG, limit: 50 } });
    expect(
      parseClassifyReadArguments(
        readOptions({
          positionals: ['calls'],
          organisationId: ORG,
          runId: RUN,
          limit: 7,
          suppliedOptions: ['organisation-id', 'run-id', 'limit'],
        }),
      ),
    ).toEqual({
      ok: true,
      value: { subcommand: 'calls', organisationId: ORG, runId: RUN, limit: 7 },
    });
    expect(
      parseClassifyReadArguments(
        readOptions({
          positionals: ['calls'],
          organisationId: ORG,
          suppliedOptions: ['organisation-id'],
        }),
      ),
    ).toEqual({
      ok: true,
      value: { subcommand: 'calls', organisationId: ORG, runId: null, limit: 50 },
    });
    expect(
      parseClassifyReadArguments(
        readOptions({ positionals: ['show'], callId: CALL, suppliedOptions: ['call-id', 'json'] }),
      ),
    ).toEqual({ ok: true, value: { subcommand: 'show', callId: CALL } });
  });

  const refusals: [string, Partial<ClassifyReadOptions>, RegExp][] = [
    ['unknown subcommand', { positionals: ['nonsense'] }, /Unknown classifier subcommand/],
    ['extra positional', { positionals: ['runs', 'extra'] }, /no further positional/],
    ['runs without organisation', { positionals: ['runs'] }, /--organisation-id/],
    ['calls without organisation', { positionals: ['calls'] }, /--organisation-id/],
    ['show without call-id', { positionals: ['show'] }, /--call-id <uuid>/],
    [
      'runs with an Erasmus code',
      { organisationId: 'F PARIS001', suppliedOptions: ['organisation-id'] },
      /single UUID/,
    ],
    [
      'calls with a non-UUID run',
      {
        positionals: ['calls'],
        organisationId: ORG,
        runId: 'latest',
        suppliedOptions: ['organisation-id', 'run-id'],
      },
      /--run-id must be a single UUID/,
    ],
    [
      'show with a non-UUID call',
      { positionals: ['show'], callId: 'latest', suppliedOptions: ['call-id'] },
      /--call-id must be a single UUID/,
    ],
  ];
  for (const [subcommand, forbidden] of [
    ['runs', ['run-id', 'model', 'attempt', 'call-id', 'execute', 'dry-run', 'country', 'file']],
    ['calls', ['model', 'attempt', 'call-id', 'execute', 'dry-run', 'eche-file']],
    ['show', ['organisation-id', 'run-id', 'model', 'attempt', 'limit', 'execute', 'url']],
  ] as const) {
    for (const option of forbidden) {
      refusals.push([
        `${subcommand} with --${option}`,
        {
          positionals: [subcommand],
          organisationId: ORG,
          callId: CALL,
          suppliedOptions: [subcommand === 'show' ? 'call-id' : 'organisation-id', option],
        },
        new RegExp(`does not accept --${option}\\b`),
      ]);
    }
  }

  it.each(refusals)('%s refuses with zero pools', async (_label, overrides, message) => {
    const parsed = parseClassifyReadArguments(readOptions(overrides));
    expect(parsed.ok).toBe(false);
    for (const json of [false, true]) {
      const p = poolless();
      expect(await executeClassifyReadCommand(readOptions({ ...overrides, json }), p.deps)).toBe(1);
      expect(p.out()).toMatch(message);
      expect(p.uses()).toBe(0);
    }
  });

  it('isUuid accepts one canonical UUID and nothing else', () => {
    expect(isUuid(ORG)).toBe(true);
    expect(isUuid(ORG.toUpperCase())).toBe(true);
    for (const bad of [
      '',
      'all',
      'latest',
      'F PARIS001',
      `${ORG} `,
      `${ORG},${RUN}`,
      ORG.slice(1),
    ]) {
      expect(isUuid(bad), bad).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// B. THE REAL ROUTER.
// ---------------------------------------------------------------------------

describe('classifier read models: the real CLI router', () => {
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

  it.each([
    [['orgunits', 'classify', 'nonsense'], /Unknown classifier subcommand: "nonsense"/],
    [
      [
        'orgunits',
        'classify',
        'nonsense',
        '--organisation-id',
        ORG,
        '--run-id',
        RUN,
        '--model',
        'm',
        '--execute',
      ],
      /Unknown classifier subcommand: "nonsense"/,
    ],
    [['orgunits', 'classify', 'runs', '--organisation-id', 'all'], /single UUID/],
    [
      ['orgunits', 'classify', 'runs', '--organisation-id', ORG, '--execute'],
      /does not accept --execute/,
    ],
    [
      ['orgunits', 'classify', 'runs', '--organisation-id', ORG, '--run-id', RUN],
      /does not accept --run-id/,
    ],
    [
      ['orgunits', 'classify', 'calls', '--organisation-id', ORG, '--attempt', '2'],
      /does not accept --attempt/,
    ],
    [
      ['orgunits', 'classify', 'calls', '--organisation-id', ORG, '--call-id', CALL],
      /does not accept --call-id/,
    ],
    [
      ['orgunits', 'classify', 'show', '--call-id', CALL, '--organisation-id', ORG],
      /does not accept --organisation-id/,
    ],
    [
      ['orgunits', 'classify', 'show', '--call-id', CALL, '--limit', '5'],
      /does not accept --limit/,
    ],
    [['orgunits', 'classify', 'show'], /requires --call-id/],
  ])('%j refuses before any database role', async (argv, message) => {
    capture();
    expect(await main([...argv])).toBe(1);
    expect(stderr).toMatch(message);
    // Never the execution action's own refusals.
    expect(stdout + stderr).not.toMatch(
      /no default classifier model|MODEL_NOT_ALLOWED|research run/,
    );
  });

  it('an invalid --limit is refused by the CLI-wide positive-integer rule', async () => {
    capture();
    expect(
      await main(['orgunits', 'classify', 'runs', '--organisation-id', ORG, '--limit', '0']),
    ).toBe(1);
  });

  it('no third positional still reaches the EXECUTION action, with its own requirements', async () => {
    capture();
    expect(await main(['orgunits', 'classify', '--organisation-id', ORG, '--run-id', RUN])).toBe(1);
    expect(stdout + stderr).toMatch(/--model.*no default classifier model/s);
    stdout = '';
    stderr = '';
    expect(await main(['orgunits', 'classify', '--organisation-id', ORG])).toBe(1);
    expect(stdout + stderr).toMatch(/--run-id.*no "latest run"/s);
  });

  it('the read route is one additive block placed before the untouched execution route', () => {
    const index = code(CLI_INDEX);
    const readRoute = index.indexOf(
      "if (group === 'orgunits' && sub === 'classify' && rest.length > 0)",
    );
    const execRoute = index.indexOf("if (group === 'orgunits' && sub === 'classify') {");
    expect(readRoute).toBeGreaterThan(0);
    expect(execRoute).toBeGreaterThan(readRoute);
    expect(index).toContain("'call-id': { type: 'string' }");
    expect(index).toContain(
      "import { runOrgunitsClassifyRead } from './commands/classifyRead.js';",
    );
    const usage = read(CLI_INDEX);
    for (const line of [
      'nwf-pe orgunits classify runs  --organisation-id <uuid> [--limit <N>] [--json]',
      'nwf-pe orgunits classify calls --organisation-id <uuid> [--run-id <uuid>]',
      'nwf-pe orgunits classify show  --call-id <uuid> [--json]',
    ]) {
      expect(usage).toContain(line);
    }
  });

  it.skipIf(!terminalAvailable)(
    'the router diff since the entry-point terminal removes no line and adds exactly one option',
    () => {
      const diff = lines(git('diff', '-U0', T, '--', CLI_INDEX)).filter((l) =>
        /^[+-][^+-]/.test(l),
      );
      expect(diff.filter((l) => l.startsWith('-'))).toEqual([]);
      expect(diff.filter((l) => /^\+\s+'?[\w-]+'?: \{ type: '(string|boolean)'/.test(l))).toEqual([
        "+      'call-id': { type: 'string' },",
      ]);
      // The execution route's body is byte-identical to the terminal's.
      const block = (source: string): string => {
        const start = source.indexOf("if (group === 'orgunits' && sub === 'classify') {");
        return source.slice(start, source.indexOf('\n  }\n', start));
      };
      expect(block(read(CLI_INDEX))).toBe(block(git('show', `${T}:${CLI_INDEX}`)));
    },
  );
});

// ---------------------------------------------------------------------------
// C. THE READ MODEL ITSELF.
// ---------------------------------------------------------------------------

describe('classifier read models: readonly, SELECT-only, deterministic', () => {
  it('the read CLI wires the readonly role exactly once and no other role', () => {
    const cli = code(READ_CLI);
    expect(cli.match(/withPool\(\s*'readonly'/g)).toHaveLength(1);
    expect(cli).not.toMatch(/withPool\(\s*'(admin|ingest|research|classifier)'/);
    expect(cli).not.toMatch(/createPool\s*\(/);
    expect(cli).not.toMatch(/process\.env/);
  });

  it('neither file can write: no write or DDL keyword, no transaction', () => {
    for (const file of [READ_MODEL, READ_CLI]) {
      const source = code(file);
      expect(source, file).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|MERGE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY)\b/,
      );
      expect(source, file).not.toMatch(/withTransaction|\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/);
    }
    expect(code(READ_CLI)).not.toMatch(/\bSELECT\b/);
  });

  it('pins the stable orders and an SQL LIMIT on both lists', () => {
    const model = code(READ_MODEL);
    expect(model).toContain('ORDER BY r.started_at DESC, r.id DESC\n      LIMIT $4');
    expect(model).toContain('ORDER BY c.requested_at DESC, c.id DESC\n      LIMIT $3');
    expect(model).toContain('ORDER BY c.repair_doc_index ASC, c.id ASC');
    expect(model).toContain('ORDER BY pc.id');
    expect(model).toContain('ORDER BY s.page_candidate_id');
  });

  it('candidate eligibility is the existing rank cutoff, never a score', () => {
    expect(MAX_CANDIDATES_PER_ROOT_TRACK).toBe(8);
    const model = code(READ_MODEL);
    expect(model).toContain('pc.rank_within_root <= $3');
    expect(model).toContain('MAX_CANDIDATES_PER_ROOT_TRACK');
    expect(model).not.toMatch(/candidate_score|signals/);
  });

  it('only ordinary calls are listed and attribute runs; repairs are joined only as provenance', () => {
    const model = code(READ_MODEL);
    expect(model.match(/repair_of_call_id IS NULL/g)).toHaveLength(3);
    // The ADR 0011 reader rule: only a COMPLETED repair is effective.
    expect(model).toContain(
      "if (repair.terminal_state === 'COMPLETED') effective.push(...classifications);",
    );
    expect(model.match(/rcomp\.terminal_state = 'COMPLETED'/g)).toHaveLength(2);
  });

  it('attribution uses only fetch eche_row_key and ordinary-call organisation_id - no URL, domain, country or time', () => {
    const model = code(READ_MODEL);
    const cte = model.slice(model.indexOf('WITH attributed AS'), model.indexOf('GROUP BY run_id'));
    expect(cte).toContain('fo.eche_row_key = $1');
    expect(cte).toContain('c.organisation_id = $2 AND c.repair_of_call_id IS NULL');
    expect(cte).not.toMatch(/url|host|domain|country|started_at|requested_at|observed_at/i);
    expect(RUN_ASSOCIATION_COVERAGE).toBe(
      'ATTRIBUTABLE_ONLY_ZERO_FETCH_UNCLASSIFIED_RUNS_CANNOT_BE_ORGANISATION_LINKED',
    );
  });

  it('never selects main text, headings, request config, scores or signals; no doc_index is invented', () => {
    const model = code(READ_MODEL);
    for (const banned of [
      'main_text,',
      'main_text ',
      'pe.main_text\n',
      'headings',
      'request_config',
      'candidate_score',
      'signals',
      'serializedBatch',
      'SYSTEM_PROMPT',
    ]) {
      expect(model, banned).not.toContain(banned);
    }
    expect(model).not.toMatch(/(?<!repair_)doc_index|\bdocIndex\b/);
    expect(model).toContain('pe.main_text_truncated');
    expect(model).not.toMatch(/\bmain_text\b(?!_truncated|_chars)/);
  });

  it('records no cost, price or monetary estimate anywhere in the read surface', () => {
    for (const file of [READ_MODEL, READ_CLI]) {
      expect(code(file), file).not.toMatch(
        /\b(price|pricing|cost|costs|usd|eur|spend|spent)\b|[$€]\s?\d+\.\d/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// D. NO PROVIDER, NO WEB, NO EXECUTION PATH.
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

describe('classifier read models: no provider, no web, no execution path', () => {
  it('the read commands reach exactly the read model, its constant, the pool helper and env config', () => {
    expect([...importClosure(READ_CLI)].sort()).toEqual(
      [
        READ_CLI,
        READ_MODEL,
        'src/orgunits/classify/constants.ts',
        'src/db/client.ts',
        'src/config/env.ts',
      ].sort(),
    );
  });

  it('no file the read commands reach imports a provider, the SDK, a socket, a subprocess or the web namespace', () => {
    for (const file of importClosure(READ_CLI)) {
      const source = code(file);
      expect(source, file).not.toMatch(
        /from\s+['"](node:(net|tls|http|https|dns|child_process)|@anthropic-ai\/[^'"]+)['"]/,
      );
      expect(source, file).not.toMatch(/\bfetch\s*\(/);
      expect(source, file).not.toMatch(/orgunits\/web|classify\/provider|ClaudeMaxAgentProvider/);
      expect(source, file).not.toMatch(/\bimport\s*\(/);
    }
    const closure = [...importClosure(READ_CLI)];
    for (const banned of [
      EXEC_CLI,
      PROVIDER_WIRING,
      PERSIST,
      'src/orgunits/classify/orchestrate.ts',
      'src/orgunits/classify/prompt.ts',
      'src/orgunits/classify/runStatus.ts',
      'src/cli/commands/discover.ts',
      'src/orgunits/sitemap.ts',
    ]) {
      expect(closure).not.toContain(banned);
    }
    expect(closure.filter((p) => /^src\/orgunits\/(web|orchestrator|signals)\//.test(p))).toEqual(
      [],
    );
  });

  it('the read files never name the provider runner factories, provider class or SDK', () => {
    const names = [
      ['createProduction', 'AgentSdkRunner'].join(''),
      ['createProduction', 'AuthStatusRunner'].join(''),
      'createProductionClassifierProvider',
      'ClaudeMaxAgentProvider',
      'claude-agent-sdk',
      'classifyProvider',
    ];
    for (const file of [READ_MODEL, READ_CLI]) {
      for (const name of names) expect(code(file), `${file} ${name}`).not.toContain(name);
    }
  });

  it('the execution action still composes fetch policy v7', () => {
    expect(FETCH_POLICY_VERSION).toBe('orgunit-fetch-policy-v7');
  });
});

// ---------------------------------------------------------------------------
// E. CHANGED SURFACE SINCE THE ENTRY-POINT TERMINAL.
// ---------------------------------------------------------------------------

describe.skipIf(!terminalAvailable)('classifier read models: changed surface', () => {
  it('descends from the entry-point terminal with single-parent commits, first freezing the entry-point test', () => {
    expect(() => git('merge-base', '--is-ancestor', T, 'HEAD')).not.toThrow();
    expect(lines(git('rev-list', '--merges', `${T}..HEAD`))).toEqual([]);
    const [first] = lines(git('rev-list', '--reverse', `${T}..HEAD`));
    if (first === undefined) return;
    expect(git('rev-parse', `${first}^`).trim()).toBe(T);
    expect(lines(git('diff', '--name-only', T, first))).toEqual([ENTRY_POINT_TEST]);
    expect(lines(git('log', '-1', '--format=%s', first))[0]).toMatch(
      /freeze classifier operator entry-point scope/,
    );
  });

  it('changes production code exactly within the authorised read-model surface', () => {
    const production = changedSinceTerminal().filter(
      (p) => p.startsWith('src/') && !p.startsWith('src/test/'),
    );
    expect(production.sort()).toEqual(AUTHORISED_PRODUCTION_FILES);
  });

  it('changes nothing outside that surface, its tests, the entry-point pin, the exact-path firewall widening, the record and the audit', () => {
    const permitted = new Set([
      ...AUTHORISED_PRODUCTION_FILES,
      ENTRY_POINT_TEST,
      THIS_TEST,
      INTEGRATION_TEST,
      FIREWALL,
      RECORD,
      AUDIT,
    ]);
    expect(changedSinceTerminal().filter((p) => !permitted.has(p))).toEqual([]);
  });

  it('leaves the execution action, its wiring, persist.ts and every classifier semantic file byte-identical', () => {
    for (const path of [
      EXEC_CLI,
      PROVIDER_WIRING,
      PERSIST,
      'src/orgunits/classify/orchestrate.ts',
      'src/orgunits/classify/operatorPlan.ts',
      'src/orgunits/classify/callIdentity.ts',
      'src/orgunits/classify/prompt.ts',
      'src/orgunits/classify/outputSchema.ts',
      'src/orgunits/classify/validate.ts',
      'src/orgunits/classify/repair.ts',
      'src/orgunits/classify/constants.ts',
      'src/orgunits/classify/assemble.ts',
      'src/orgunits/classify/loaders.ts',
      'src/orgunits/classify/ordering.ts',
      'src/orgunits/classify/document.ts',
      'src/orgunits/classify/runStatus.ts',
      'src/orgunits/web/evidenceCanonical.ts',
      'src/orgunits/web/extract.ts',
      'src/orgunits/web/redact.ts',
    ]) {
      expect(read(path), path).toBe(git('show', `${T}:${path}`));
    }
    expect(
      changedSinceTerminal().filter(
        (p) =>
          p.startsWith('src/orgunits/classify/provider/') ||
          p.startsWith('src/orgunits/classify/evaluation/') ||
          p.startsWith('src/orgunits/web/') ||
          p.startsWith('src/orgunits/orchestrator/') ||
          p.startsWith('src/orgunits/signals/') ||
          /^(migrations|scripts|docker|\.github)\//.test(p) ||
          /^package(-lock)?\.json$/.test(p) ||
          p === 'CLAUDE.md',
      ),
    ).toEqual([]);
  });

  it('the firewall change is exactly the exact-path read-model widening: nothing removed but two guarded exemptions', () => {
    const diff = lines(git('diff', '-U0', T, '--', FIREWALL)).filter((l) => /^[+-][^+-]/.test(l));
    const removed = diff.filter((l) => l.startsWith('-'));
    expect(removed).toEqual([
      "-  it('never names a classifier-persistence table OUTSIDE persist.ts', () => {",
    ]);
    const added = diff.filter((l) => l.startsWith('+')).join('\n');
    expect(added).toContain(
      "const CLASSIFY_OPERATOR_READ_MODEL_FILE = 'src/orgunits/classify/operatorReadModels.ts';",
    );
    expect(added.match(/continue;/g)).toHaveLength(2);
    expect(added).toContain("expect(imports).toEqual(['./constants.js', 'pg']);");
  });

  it('the migration set is unchanged (0001-0012) and adds no grant', () => {
    const now = lines(git('ls-files', 'migrations'));
    expect(now).toEqual(lines(git('ls-tree', '-r', '--name-only', T, '--', 'migrations')));
    expect(now.at(-1)).toMatch(/^migrations\/0012_/);
    expect(lines(git('diff', '--name-only', T, '--', 'migrations'))).toEqual([]);
  });

  it('nwf_readonly already holds SELECT on every table the read model reads (migrations 0002, 0007, 0009)', () => {
    const grants = [
      '0002_roles.sql',
      '0007_orgunit_research_foundation.sql',
      '0009_orgunit_classifier_foundation.sql',
    ]
      .map((f) => read(`migrations/${f}`).replace(/--.*$/gm, ''))
      .join('\n');
    const readonlyGrants = [
      ...grants.matchAll(/GRANT\s+SELECT\s+ON\s+([^;]+?)\s+TO\s+nwf_readonly/g),
    ]
      .flatMap((m) => m[1]!.split(','))
      .map((t) => t.trim());
    for (const table of [
      'organisations',
      'orgunit_research_runs',
      'orgunit_research_run_completions',
      'orgunit_fetch_observations',
      'orgunit_page_evidence',
      'orgunit_page_candidates',
      'orgunit_classifier_calls',
      'orgunit_classifier_call_completions',
      'orgunit_page_classifications',
      'orgunit_classification_subjects',
    ]) {
      expect(readonlyGrants, table).toContain(table);
    }
    // Every FROM/JOIN target except the one CTE the run query defines.
    const tables = new Set(
      [...code(READ_MODEL).matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+)/g)]
        .map((m) => m[1]!)
        .filter((t) => t !== 'attributed'),
    );
    expect(tables.size).toBe(10);
    expect([...tables].filter((t) => !readonlyGrants.includes(t))).toEqual([]);
  });

  it('modifies no existing document and adds only this record and audit under docs/', () => {
    const prior = lines(git('ls-tree', '-r', '--name-only', T, '--', 'docs'));
    expect(lines(git('diff', '--name-only', T, '--', ...prior))).toEqual([]);
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
    const [first] = lines(git('rev-list', '--reverse', `${T}..HEAD`));
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
// F. THE ENGINEERING RECORD.
// ---------------------------------------------------------------------------

describe.skipIf(!recordsPresent)(
  'classifier read models: the record is a result, not an authority',
  () => {
    const record = (): Record<string, unknown> =>
      JSON.parse(read(RECORD)) as Record<string, unknown>;

    it('names the canonical base, the commands, the terminal and authorises nothing', () => {
      const r = record();
      expect(r['recordKind']).toBe('NON_EVALUATION_CLASSIFIER_OPERATOR_READ_MODELS_RESULT');
      expect(r['canonicalBase']).toMatchObject({ commit: T });
      expect(r['commands']).toEqual([
        'orgunits classify runs',
        'orgunits classify calls',
        'orgunits classify show',
      ]);
      expect(r['thisFileAuthorises']).toEqual([]);
      expect(r['terminalState']).toBe('CLASSIFIER_OPERATOR_READ_MODELS_READY_FOR_OPERATOR_API');
      expect(r['nextSlice']).toBe('CLASSIFIER_OPERATOR_API_V1');
    });

    it('declares every contract flag exactly', () => {
      expect(record()).toMatchObject({
        databaseRole: 'readonly',
        providerCalls: 0,
        writes: 0,
        runAssociationCoverage: 'ATTRIBUTABLE_ONLY',
        zeroFetchUnclassifiedRunLimitation: true,
        ordinaryCallsTopLevelOnly: true,
        repairProvenanceVisible: true,
        effectiveClassificationReaderRule: 'ADR_0011',
        rawMainTextExposed: false,
        persistedValidatedRationaleExposed: true,
        classifierSemanticChange: false,
        migrationChange: false,
        grantChange: false,
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

/**
 * WW H-RT FIREWALL - the Mac runtime hardening, pinned by path and content
 * (never by commit):
 *
 *   - the runtime checks EVERY connection string the wired worker and the
 *     OWNER's review command use: the set is bound to the wiring's own roles
 *     and to the review CLI's pools, so a new role cannot slip past it;
 *   - each URL is read by pg's own parser (pg's dependency, NOT this
 *     repository's) only AFTER any query string has been refused;
 *   - no PG* variable reaches a child, and engine.ts scrubs its own first;
 *   - a lock is removed only by rename + re-read + no-clobber restore, and a
 *     pid is signalled only after its state file confirms pid and nonce;
 *   - every shutdown request may arm the EMERGENCY_STOP kill;
 *   - doctor's review-key and Claude-profile checks lstat a PATH and never
 *     open, read or list anything there.
 */
import { describe, expect, it } from 'vitest';

import { RUNTIME_DATABASE_VARIABLES, WORKER_DATABASE_VARIABLES } from '../../runtime/targets.js';
import { codeOf, readCurrent } from '../helpers/phaseRange.js';

const code = (file: string): string => codeOf(readCurrent(file));
const TARGETS = 'src/runtime/targets.ts';
const PROCESSES = 'src/runtime/processes.ts';
const LOCK = 'src/runtime/lock.ts';
const COMMANDS = 'src/runtime/commands.ts';
const SUPERVISOR = 'src/runtime/supervisor.ts';
const DOCTOR = 'src/runtime/doctor.ts';
const ENGINE = 'src/runtime/engine.ts';
const PROFILE = 'src/runtime/classifierProfile.ts';

/** `createPool('x_y')` / role literals -> `DATABASE_URL_X_Y` (config/env.ts ROLE_VAR naming). */
const variableOf = (role: string): string => `DATABASE_URL_${role.toUpperCase()}`;

describe('WW H-RT: every connection string the worker and the review command use is checked', () => {
  it('the worker set is the production wiring roles plus the owner path and the worker login', () => {
    const wiring = code('src/orgunits/acquisitionWiring/production.ts');
    const m = /export type WiringRole = ([^;]+);/.exec(wiring);
    expect(m, 'WiringRole is declared in production.ts').not.toBeNull();
    const roles = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((r) => r[1]!);
    expect(roles.length).toBeGreaterThan(0);
    const expected = new Set([
      'DATABASE_URL_ADMIN',
      'DATABASE_URL_ACQUISITION_WORKER',
      ...roles.map(variableOf),
    ]);
    expect(new Set(WORKER_DATABASE_VARIABLES)).toEqual(expected);
    // env.ts still maps each role to exactly this variable name.
    const env = code('src/config/env.ts');
    for (const role of [...roles, 'admin', 'acquisition_worker']) {
      expect(env).toContain(`${role}: '${variableOf(role)}',`);
    }
  });

  it('every pool the acquisition CLI (worker, status, control, review) creates is checked', () => {
    const cli = code('src/cli/commands/acquisition.ts');
    const roles = new Set([...cli.matchAll(/createPool\('([a-z_]+)'\)/g)].map((r) => r[1]!));
    expect(roles.size).toBeGreaterThan(0);
    for (const role of roles) {
      expect(RUNTIME_DATABASE_VARIABLES as readonly string[]).toContain(variableOf(role));
    }
    // The worker's stage handlers get `createPool(role)` for every WiringRole.
    expect(cli).toContain('poolFor: (role: WiringRole) => createPool(role),');
  });

  it('start and the supervisor default to the full worker set; engine.ts passes all of them', () => {
    expect(code(TARGETS)).toContain(
      'const required = options.required ?? WORKER_DATABASE_VARIABLES;',
    );
    expect(code(COMMANDS)).toContain('guardTargets(v, deps, WORKER_DATABASE_VARIABLES);');
    expect(code(COMMANDS)).not.toMatch(/ALL_VARS/);
    expect(code(ENGINE)).toContain('RUNTIME_DATABASE_VARIABLES.flatMap(');
  });
});

describe("WW H-RT: URLs are read strictly, by pg's own parser, after the query string is refused", () => {
  it('imports pg-connection-string (a dependency of pg, not of this repository)', () => {
    const t = code(TARGETS);
    expect(t).toContain("import { parse as parsePgConnectionString } from 'pg-connection-string';");
    const pkg = JSON.parse(readCurrent('package.json')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('pg-connection-string');
    const pgPkg = JSON.parse(readCurrent('node_modules/pg/package.json')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pgPkg.dependencies)).toContain('pg-connection-string');
  });

  it('refuses any query string and any non-postgres:// form BEFORE pg parses (no ssl* file read)', () => {
    // Raw source: the comment stripper would cut this line at its regex's `//`.
    const t = readCurrent(TARGETS);
    const scheme = t.indexOf('if (!/^postgres(?:ql)?:\\/\\//.test(value))');
    const query = t.indexOf("if (value.includes('?') || url.search !== '')");
    const parse = t.indexOf('parsePgConnectionString(value)');
    expect(scheme).toBeGreaterThan(0);
    expect(query).toBeGreaterThan(scheme);
    expect(parse).toBeGreaterThan(query);
    expect(t).toContain("return refuse('names no explicit port");
    expect(t).toContain("return refuse('names no database");
    expect(t).toContain("return refuse('names no user");
  });

  it('no child gets a PG* variable, and engine.ts scrubs its own before running a command', () => {
    const p = code(PROCESSES);
    expect(p).toContain('const POSTGRES_VARIABLE = /^PG/;');
    expect(p).not.toMatch(/env:\s*process\.env/);
    const e = code(ENGINE);
    const scrub = e.indexOf('scrubPostgresVariables();');
    expect(scrub).toBeGreaterThan(0);
    expect(e.indexOf('runEngine(process.argv.slice(2)')).toBeGreaterThan(scrub);
  });
});

describe('WW H-RT: locks and signals', () => {
  it('a lock is removed only by rename + re-read + no-clobber restore, never unlinked by path', () => {
    const l = code(LOCK);
    expect(l).not.toMatch(/unlinkSync\(paths\.lockFile\)|unlinkIfPresent\(paths\.lockFile\)/);
    expect(l).not.toMatch(/removeLockFiles/);
    expect(l).toContain('renameSync(paths.lockFile, moved);');
    expect(l).toContain('linkSync(moved, paths.lockFile);');
    expect(l).toContain('if (raw === judgedRaw) {');
    expect(code(COMMANDS)).toContain('removeLockIfUnchanged(deps.paths, lock.raw)');
  });

  it('a lock from before the boot is stale, and the boot time comes from the fixed sysctl probe', () => {
    expect(code(LOCK)).toContain("return { kind: 'STALE', lock, raw, why: 'PREDATES_BOOT' };");
    expect(code(COMMANDS)).toContain('deps.procs.bootTime().then(parseBootTime, () => null)');
    expect(code(PROCESSES)).toContain('spawn(SYSCTL, [...SYSCTL_BOOT_TIME_ARGV], {');
  });

  it('every signal to a lock pid is preceded by the pid + nonce confirmation', () => {
    const c = code(COMMANDS);
    const signals = c.match(/deps\.signal\(/g) ?? [];
    const confirms = c.match(/supervisorConfirmed\(deps\.paths, lock\.lock\)/g) ?? [];
    expect(signals).toHaveLength(2);
    expect(confirms).toHaveLength(2);
    for (const fn of ['async function notifySupervisor', 'async shutdown(v, deps)']) {
      const start = c.indexOf(fn);
      const body = c.slice(start, c.indexOf('deps.signal(', start));
      expect(body, fn).toContain('supervisorConfirmed(deps.paths, lock.lock)');
    }
    expect(code(LOCK)).toContain('state.nonce === lock.nonce &&');
  });

  it('a repeated shutdown request may still arm the EMERGENCY_STOP kill (no early return)', () => {
    const s = code(SUPERVISOR);
    const start = s.indexOf('requestShutdown(): void {');
    const body = s.slice(start, s.indexOf('async run()', start));
    expect(body).not.toMatch(/if \(this\.#shutdown\) return;/);
    expect(body).toContain('void this.#escalateIfEmergency(worker);');
    expect(s).toContain('if (this.#killArmedFor === worker) return;');
  });
});

describe('WW H-RT: doctor reports paths, never contents', () => {
  it('the review key path only ever reaches lstat', () => {
    const d = code(DOCTOR);
    const uses = d.match(/deps\.reviewKeyFile/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(d).toContain('const facts = deps.pathFacts(file);');
    const start = d.indexOf('export function pathFactsOf(');
    const body = d.slice(start, d.indexOf('\n}\n', start));
    expect(body).toContain('lstatSync(path)');
    expect(body).not.toMatch(/readFileSync|openSync|createReadStream|readdirSync|(?<!l)statSync\(/);
  });

  it('the Claude Max profile check resolves the path through the classifier resolver and lstats it only', () => {
    const p = code(PROFILE);
    expect(p).toContain('resolveClassifierProfileDir({ env, repoRoot })');
    expect(p).toContain('lstatSync(result.profileDir)');
    expect(p).not.toMatch(/readFileSync|openSync|createReadStream|readdirSync|opendirSync/);
    expect(code(ENGINE)).toContain(
      'classifierProfileFacts(inheritedEnvironment(), paths.repoRoot)',
    );
  });
});

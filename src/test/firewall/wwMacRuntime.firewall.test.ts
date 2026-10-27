/**
 * WW E-M FIREWALL - the OWNER's Mac control surface (`nwf-engine`, OWNER
 * directive 2026-10-27 s5 "start it and let it work").
 *
 * The directive approves ONE thing: a local runtime that keeps the EXISTING
 * acquisition worker running on the OWNER's Mac. It does no acquisition work
 * and holds no authority of its own. This file pins that by path and content
 * (never by commit):
 *
 *   - src/runtime/ is exactly the named files;
 *   - it opens no socket (no net/tls/http/https/dns/dgram, no fetch, no
 *     WebSocket) and reaches the database only through the existing
 *     `createPool` helper;
 *   - exactly ONE file starts processes, only with `spawn` and `shell: false`,
 *     and only `process.execPath` (the Engine's own CLI / the runtime's own
 *     supervisor) or `docker` with a FIXED compose vector (ps, and up
 *     --no-recreate; never down, never -v);
 *   - the Engine CLI is invoked only as `acquisition status | campaign control
 *     (PAUSE/RESUME/STOP/EMERGENCY_STOP) | worker` - never record, never
 *     START, never a migration;
 *   - no `launchctl` is ever executed (it is only printed for the OWNER), no
 *     sudo, no Keychain, no key or credential file, no SQL write;
 *   - the acquisition namespace is read at one exact path, through its public
 *     index only, for whether a campaign key is pinned;
 *   - the LaunchAgent is written only behind `--i-understand --execute`, with
 *     RunAtLoad and KeepAlive false by default.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { launchAgentPlist } from '../../runtime/launchAgent.js';
import { enginePathsUnder } from '../../runtime/paths.js';
import {
  COMPOSE_ARGV,
  ENGINE_CLI_ENTRY,
  RUNTIME_CONTROL_ACTIONS,
  RUNTIME_ENTRY,
  acquisitionArgv,
} from '../../runtime/processes.js';
import { ENGINE_OPTIONS } from '../../runtime/args.js';
import {
  REPO_ROOT,
  codeOf,
  productionFiles,
  readCurrent,
  specifiers,
} from '../helpers/phaseRange.js';

const NS = 'src/runtime/';
const FILES = [
  'args.ts',
  'campaignTrust.ts',
  'clock.ts',
  'commands.ts',
  'doctor.ts',
  'engine.ts',
  'envelope.ts',
  'explain.ts',
  'launchAgent.ts',
  'lock.ts',
  'logs.ts',
  'paths.ts',
  'processes.ts',
  'status.ts',
  'supervisor.ts',
  'targets.ts',
].map((f) => `${NS}${f}`);
const PROCESS_SITE = `${NS}processes.ts`;
const TRUST_SITE = `${NS}campaignTrust.ts`;
const code = (file: string): string => codeOf(readCurrent(file));

/** Every module specifier src/runtime may name. */
const ALLOWED_SPECIFIERS = new Set([
  'node:child_process',
  'node:crypto',
  'node:fs',
  'node:os',
  'node:path',
  'node:url',
  'node:util',
  'pg',
  '../config/env.js',
  '../db/client.js',
  '../db/safety.js',
  '../orgunits/acquisition/index.js',
  ...FILES.map((f) => `./${f.slice(NS.length).replace(/\.ts$/, '.js')}`),
]);

describe('WW E-M: src/runtime is exactly what was approved', () => {
  it('holds exactly the named files', () => {
    const files = readdirSync(join(REPO_ROOT, NS))
      .map((f) => `${NS}${f}`)
      .sort();
    expect(files).toEqual([...FILES].sort());
  });

  it('imports only the allowed modules, and pg only as a type', () => {
    for (const file of FILES) {
      for (const spec of specifiers(code(file))) {
        expect(ALLOWED_SPECIFIERS.has(spec), `${file} imports ${spec}`).toBe(true);
      }
      expect(code(file), file).not.toMatch(
        /^import\s+pg\b|import\s+\{[^}]*\b(Pool|Client)\b[^}]*\}\s+from\s+'pg'/m,
      );
    }
  });

  it('opens no socket and reaches the database only through createPool', () => {
    for (const file of FILES) {
      const c = code(file);
      expect(c, file).not.toMatch(
        /node:(net|tls|http|https|dns|dgram|worker_threads|cluster)\b|\bfetch\s*\(|WebSocket|XMLHttpRequest/,
      );
      expect(c, file).not.toMatch(/new\s+(pg\.)?(Pool|Client)\s*\(/);
    }
    expect(code(`${NS}engine.ts`)).toContain('createDoctorDbProbes(createPool)');
    const poolUsers = FILES.filter((f) => /createPool/.test(code(f)));
    expect(poolUsers).toEqual([`${NS}engine.ts`]);
  });

  it('issues no SQL write and never applies a migration', () => {
    for (const file of FILES) {
      const c = code(file);
      expect(c, file).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|CREATE)\b/,
      );
      expect(c, file).not.toMatch(/db\/migrate|\bmigrate\s*\(|\breset\s*\(/);
    }
    expect(code(`${NS}doctor.ts`)).toContain("'BEGIN TRANSACTION READ ONLY'");
  });
});

describe('WW E-M: one process seam with a fixed allowlist', () => {
  it('only processes.ts names child_process, and it spawns without a shell', () => {
    for (const file of productionFiles().filter((f) => f.startsWith(NS))) {
      if (file === PROCESS_SITE) continue;
      expect(code(file), file).not.toMatch(
        /child_process|(?<!\.)\bspawn\s*\(|(?<!\.)\bexec(File|Sync)?\s*\(|\bfork\s*\(/,
      );
    }
    const p = code(PROCESS_SITE);
    expect(p).toContain("import { spawn, type ChildProcess } from 'node:child_process';");
    expect(p).not.toMatch(/\bexec(File|Sync|FileSync)?\s*\(|spawnSync|\bfork\s*\(/);
    const spawns = [...p.matchAll(/spawn\(\s*([\w.]+)/g)].map((m) => m[1]);
    expect(spawns.sort()).toEqual(['DOCKER', 'process.execPath', 'process.execPath']);
    expect(p).toContain("const DOCKER = 'docker';");
    expect(p.match(/shell: false/g)).toHaveLength(3);
    expect(p).not.toMatch(/shell:\s*(true|process|'|")/);
  });

  it('runs only the Engine CLI, the runtime supervisor and two docker compose vectors', () => {
    expect(ENGINE_CLI_ENTRY).toBe('src/cli/index.ts');
    expect(RUNTIME_ENTRY).toBe('src/runtime/engine.ts');
    expect(COMPOSE_ARGV).toEqual({
      ps: [
        'compose',
        '-p',
        'nwf-partnership-engine',
        '-f',
        'docker-compose.yml',
        'ps',
        '--all',
        '--format',
        'json',
        'postgres',
      ],
      up: [
        'compose',
        '-p',
        'nwf-partnership-engine',
        '-f',
        'docker-compose.yml',
        'up',
        '-d',
        '--no-recreate',
        '--wait',
        'postgres',
      ],
    });
    expect(Object.isFrozen(COMPOSE_ARGV)).toBe(true);
    const p = code(PROCESS_SITE);
    expect(p).not.toMatch(/'(down|rm|-v|--volumes|--force-recreate|restart|exec|run|stop|pause)'/);
  });

  it('invokes the acquisition CLI only for status, PAUSE/RESUME/STOP/EMERGENCY_STOP and the worker', () => {
    expect([...RUNTIME_CONTROL_ACTIONS]).toEqual(['PAUSE', 'RESUME', 'STOP', 'EMERGENCY_STOP']);
    const id = '11111111-0000-4000-8000-000000000001';
    const heads = [
      acquisitionArgv({ kind: 'status', campaignId: id }),
      acquisitionArgv({ kind: 'control', campaignId: id, action: 'PAUSE' }),
      acquisitionArgv({ kind: 'worker', campaignId: id, workerId: 'mac-supervisor' }),
    ].map((a) => a.slice(0, a[1] === 'campaign' ? 3 : 2).join(' '));
    expect(heads).toEqual([
      'acquisition status',
      'acquisition campaign control',
      'acquisition worker',
    ]);
    expect(() =>
      acquisitionArgv({ kind: 'control', campaignId: id, action: 'START' as never }),
    ).toThrow();
    for (const file of FILES) {
      expect(code(file), file).not.toMatch(/'record'|'verify'|'START'/);
    }
  });
});

describe('WW E-M: nothing system-level, nothing secret, nothing loaded', () => {
  it('never executes launchctl, never uses sudo, never touches the Keychain or a key/credential file', () => {
    for (const file of FILES) {
      const c = code(file);
      expect(c, file).not.toMatch(
        /\bsudo\b|keychain|find-generic-password|SecKeychain|\bsecurity\s+(find|add|delete)-/i,
      );
      expect(c, file).not.toMatch(
        /launchctl\s+load|\.credentials|CLAUDE_CONFIG_DIR|\.claude\b|createPrivateKey|privateKey|id_ed25519|\.pem\b/,
      );
      if (file !== `${NS}launchAgent.ts`) expect(c, file).not.toContain('launchctl');
    }
    expect(code(PROCESS_SITE)).not.toContain('launchctl');
  });

  it('reads the environment only through config/env.js, and passes it through to children unchanged', () => {
    for (const file of FILES) {
      const reads = code(file).match(/process\.env\b[^\n]*/g) ?? [];
      if (file === PROCESS_SITE) {
        expect(
          reads.every((r) => r.startsWith('process.env,')),
          file,
        ).toBe(true);
      } else {
        expect(reads, file).toEqual([]);
      }
    }
  });

  it('reads the acquisition namespace at one path, through its public index, for the pinned key count only', () => {
    const importers = FILES.filter((f) => /orgunits\//.test(code(f)));
    expect(importers).toEqual([TRUST_SITE]);
    expect(specifiers(code(TRUST_SITE)).filter((s) => s.includes('orgunits'))).toEqual([
      '../orgunits/acquisition/index.js',
    ]);
    expect(code(TRUST_SITE)).not.toMatch(/vitestOnly|CampaignTrustSet\.\w+\((?!\))/);
    for (const file of FILES) {
      expect(code(file), file).not.toMatch(
        /commands\/acquisition|orgunits\/(web|classify|sourceDiscovery|orchestrator|signals)|gateway|executeWebAttempt|claude-agent-sdk|anthropic/,
      );
    }
  });

  it('writes a LaunchAgent only behind --i-understand and --execute, with RunAtLoad/KeepAlive false by default', () => {
    const commands = code(`${NS}commands.ts`);
    expect(commands.match(/writeLaunchAgent\(/g)).toHaveLength(1);
    const understand = commands.indexOf("if (v['i-understand'] !== true)");
    const execute = commands.indexOf(
      "if (v['execute'] !== true) {\n      deps.out('DRY RUN: nothing was written.",
    );
    const write = commands.indexOf('writeLaunchAgent(deps.paths, plist)');
    expect(understand).toBeGreaterThan(0);
    expect(execute).toBeGreaterThan(understand);
    expect(write).toBeGreaterThan(execute);
    const paths = enginePathsUnder('/s', '/l', '/a', '/repo');
    const plist = launchAgentPlist({
      nodePath: '/n/node',
      paths,
      campaignId: '11111111-0000-4000-8000-000000000001',
      runAtLoad: false,
    });
    expect(plist).toContain('<key>RunAtLoad</key><false/>');
    expect(plist).toContain('<key>KeepAlive</key><false/>');
    expect(paths.launchAgentFile).toBe('/a/nl.newwavefluent.nwf-engine.plist');
  });

  it('declares no option that could widen the target or the authority', () => {
    for (const options of Object.values(ENGINE_OPTIONS)) {
      for (const name of Object.keys(options)) {
        expect(name).not.toMatch(
          /^all$|every|url|key|trust|signature|migrat|grant|switch|sql|sudo|host|port/,
        );
      }
    }
    expect(code(`${NS}targets.ts`)).toContain(
      "const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);",
    );
  });

  it('is reached through one npm script and one thin wrapper', () => {
    const pkg = JSON.parse(readCurrent('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['engine']).toBe(
      'node --env-file-if-exists=.env --import tsx src/runtime/engine.ts',
    );
    const wrapper = readCurrent('scripts/nwf-engine');
    expect(wrapper).toContain('exec npm run -s engine -- "$@"');
    expect(wrapper).not.toMatch(/sudo|launchctl|docker|curl|wget/);
  });

  it('the child-process widening of phase2b is by exact path', () => {
    expect(readCurrent('src/test/firewall/phase2b.firewall.test.ts')).toContain(
      "const MAC_RUNTIME_PROCESS_SITE = 'src/runtime/processes.ts';",
    );
  });
});

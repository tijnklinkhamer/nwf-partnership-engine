/**
 * PHASE 2B-2D2C-F1 — isolation and artifacts: the child-environment
 * allowlist and its negative controls (also through the real Tier-2
 * harness with a fixture that dumps its environment), the write-once
 * durable artifact writer and reader, output-root validation, and
 * source-level assertions that the runner namespace reaches no database, no
 * network and no production runner outside the one execution-only loader.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FORBIDDEN_AUTH_VARIABLES,
  PROHIBITED_SETUP_TOKEN_VARIABLE,
} from '../../orgunits/classify/provider/authConflicts.js';
import { CLASSIFIER_PROFILE_DIR_VARIABLE } from '../../orgunits/classify/provider/profile.js';
import {
  HARNESS_SCRATCH_DIR_VARIABLE,
  runProcessIsolatedBatch,
  validateSignalTargetPid,
} from '../harness/processIsolatedBatch.js';
import {
  ARTIFACT_FILE_NAMES,
  ARTIFACT_KINDS,
  attemptDirectoryOf,
  envelopeOf,
  readArtifact,
  serializeEnvelope,
  validateOutputRoot,
  writeArtifactOnce,
  writeFileOnceDurably,
  WriteOnceCollisionError,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  buildRunnerChildEnvironment,
  childEnvironmentViolations,
  OS_INJECTED_VARIABLES,
  RUNNER_CHILD_ENV_ALLOWLIST,
  RUNNER_CHILD_ENV_OS_ALLOWLIST,
} from '../harness/phase2b2d2c/childEnvironment.js';
import { RUNNER_ARTIFACT_VERSION } from '../harness/phase2b2d2c/constants.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';

const IS_WINDOWS = process.platform === 'win32';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HARNESS_DIR = 'src/test/harness/phase2b2d2c';
const LOADER = 'scripts/phase2b-2d2c-production-runtime.ts';
const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f1-iso-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
const code = (relative: string): string =>
  readFileSync(join(ROOT, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
const harnessFiles = (): string[] =>
  readdirSync(join(ROOT, HARNESS_DIR)).map((f) => `${HARNESS_DIR}/${f}`);

/** Forbidden names, built from the production guard's own constants so no test spells a credential identifier. */
const FORBIDDEN_NAMES = [
  ...FORBIDDEN_AUTH_VARIABLES,
  PROHIBITED_SETUP_TOKEN_VARIABLE,
  'DATABASE_URL_ADMIN',
  'DATABASE_URL_INGEST',
  'NODE_OPTIONS',
  'NWF_PE_VERBOSE',
  'DEBUG',
  'CLAUDE_CODE_ENTRYPOINT',
  'PGPASSWORD',
];

describe('2D2C-F1 isolation: the child environment allowlist', () => {
  const noisyParent = Object.fromEntries([
    ...FORBIDDEN_NAMES.map((n) => [n, 'leak']),
    ['PATH', '/usr/bin'],
    ['HOME', '/home/x'],
    ['TMPDIR', '/tmp'],
    ['TEMP', 'C:\\Temp'],
    ['TMP', 'C:\\Tmp'],
    ['USERPROFILE', 'C:\\Users\\x'],
    ['SystemRoot', 'C:\\Windows'],
    ['ComSpec', 'cmd.exe'],
    [CLASSIFIER_PROFILE_DIR_VARIABLE, '/ambient/profile'],
  ]);

  it('POSIX: exactly PATH, TMPDIR, TMP, TEMP, HOME plus the explicit classifier directory; nothing forbidden', () => {
    const env = buildRunnerChildEnvironment({
      parentEnv: noisyParent,
      platform: 'posix',
      classifierConfigDir: '/explicit/profile',
    });
    expect(Object.keys(env).sort()).toEqual(
      ['HOME', CLASSIFIER_PROFILE_DIR_VARIABLE, 'PATH', 'TEMP', 'TMP', 'TMPDIR'].sort(),
    );
    expect(env[CLASSIFIER_PROFILE_DIR_VARIABLE]).toBe('/explicit/profile');
    for (const name of FORBIDDEN_NAMES) expect(name in env, name).toBe(false);
    expect(RUNNER_CHILD_ENV_OS_ALLOWLIST.posix).toEqual(['PATH', 'TMPDIR', 'TMP', 'TEMP', 'HOME']);
  });

  it('Windows: exactly PATH, TMP, TEMP, USERPROFILE, SystemRoot, ComSpec plus the explicit directory, with case-insensitive lookup', () => {
    const env = buildRunnerChildEnvironment({
      parentEnv: {
        ...noisyParent,
        PATH: undefined,
        USERPROFILE: undefined,
        Path: 'C:\\bin',
        userprofile: 'C:\\Users\\y',
      },
      platform: 'win32',
      classifierConfigDir: 'C:\\profile',
    });
    expect(Object.keys(env).sort()).toEqual(
      [
        'ComSpec',
        CLASSIFIER_PROFILE_DIR_VARIABLE,
        'PATH',
        'SystemRoot',
        'TEMP',
        'TMP',
        'USERPROFILE',
      ].sort(),
    );
    expect(env['PATH']).toBe('C:\\bin');
    expect(env['USERPROFILE']).toBe('C:\\Users\\y');
    for (const name of FORBIDDEN_NAMES) expect(name in env, name).toBe(false);
    expect(RUNNER_CHILD_ENV_OS_ALLOWLIST.win32).toEqual([
      'PATH',
      'TMP',
      'TEMP',
      'USERPROFILE',
      'SystemRoot',
      'ComSpec',
    ]);
  });

  it('the classifier directory comes only from the explicit argument, never the ambient parent value, and blank is refused', () => {
    const env = buildRunnerChildEnvironment({
      parentEnv: noisyParent,
      platform: 'posix',
      classifierConfigDir: '/explicit/profile',
    });
    expect(env[CLASSIFIER_PROFILE_DIR_VARIABLE]).not.toBe('/ambient/profile');
    expect(() =>
      buildRunnerChildEnvironment({ parentEnv: {}, platform: 'posix', classifierConfigDir: '  ' }),
    ).toThrow(/blank/);
    expect(RUNNER_CHILD_ENV_ALLOWLIST).toContain(HARNESS_SCRATCH_DIR_VARIABLE);
    expect(RUNNER_CHILD_ENV_ALLOWLIST).toContain(CLASSIFIER_PROFILE_DIR_VARIABLE);
    for (const name of FORBIDDEN_NAMES) expect(RUNNER_CHILD_ENV_ALLOWLIST).not.toContain(name);
  });

  it('the child self-check names every variable outside the allowlist and tolerates only the OS-injected names', () => {
    expect(
      childEnvironmentViolations({
        PATH: '/usr/bin',
        [CLASSIFIER_PROFILE_DIR_VARIABLE]: '/p',
        [HARNESS_SCRATCH_DIR_VARIABLE]: '/s',
        __CF_USER_TEXT_ENCODING: '0x1F5:0:0',
      }),
    ).toEqual([]);
    expect(
      childEnvironmentViolations({
        PATH: '/usr/bin',
        NODE_OPTIONS: '--x',
        DATABASE_URL_ADMIN: 'p',
      }),
    ).toEqual(['DATABASE_URL_ADMIN', 'NODE_OPTIONS']);
    expect(childEnvironmentViolations({ path: '/usr/bin' })).toEqual([]);
    expect(OS_INJECTED_VARIABLES).toEqual(['__CF_USER_TEXT_ENCODING']);
  });
});

describe.skipIf(IS_WINDOWS)(
  '2D2C-F1 isolation: through the real Tier-2 harness, the child sees only the allowlist',
  () => {
    it('a fixture child forked with the explicit environment reports exactly the allowlisted names, no exec flags, and the scratch variable', async () => {
      const attemptDir = join(SCRATCH, 'env-attempt');
      mkdirSync(attemptDir);
      const manifest = {
        attemptDir,
        variantName: 'PROMPT_V1_CANONICAL',
        logicalBatchOrdinal: 1,
        attemptNo: 1,
        requestedModelId: 'x',
      };
      const manifestPath = join(attemptDir, 'child-manifest.json');
      writeFileSync(manifestPath, serializeEnvelope(envelopeOf('CHILD_MANIFEST', manifest)));
      const childEnv = buildRunnerChildEnvironment({
        parentEnv: {
          ...process.env,
          DATABASE_URL_ADMIN: 'postgres://never',
          NODE_OPTIONS: '--never',
        },
        platform: 'posix',
        classifierConfigDir: '/explicit/profile',
      });
      let spawned: number | null = null;
      const result = await runProcessIsolatedBatch({
        modulePath: join(ROOT, 'src/test/fixtures/phase2b2d2c/fixtureChild.mjs'),
        args: ['dumps-environment', '--manifest', manifestPath],
        watchdogMs: 20_000,
        graceMs: 1_000,
        childEnv,
        onChildSpawned: (pid) => {
          spawned = pid;
        },
      });
      expect(result.outcome).toBe('COMPLETED');
      expect(result.exitCode).toBe(0);
      const read = readArtifact<{ environmentNames: string[]; execArgv: string[] }>(
        attemptDir,
        'CHILD_PREFLIGHT',
      );
      expect(read.ok).toBe(true);
      if (!read.ok) return;
      const names = read.envelope.record.environmentNames;
      const permitted = new Set([...RUNNER_CHILD_ENV_ALLOWLIST, ...OS_INJECTED_VARIABLES]);
      for (const name of names) expect(permitted.has(name), name).toBe(true);
      expect(names).toContain(HARNESS_SCRATCH_DIR_VARIABLE);
      expect(names).toContain(CLASSIFIER_PROFILE_DIR_VARIABLE);
      for (const name of FORBIDDEN_NAMES) expect(names).not.toContain(name);
      expect(read.envelope.record.execArgv).toEqual([]);
      expect(spawned).not.toBeNull();
      try {
        process.kill(validateSignalTargetPid(spawned!), 0);
        expect.fail('the fixture child is still alive');
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe('ESRCH');
      }
      expect(existsSync(result.scratchDir)).toBe(false);
    });
  },
);

describe('2D2C-F1 artifacts: write-once, durable, self-hashed', () => {
  it('writes once, refuses a second write with the content unchanged, and leaves no temporary file', () => {
    const dir = join(SCRATCH, 'once');
    mkdirSync(dir);
    const path = join(dir, 'a.json');
    const report = writeFileOnceDurably(path, 'first\n');
    expect(report).toMatchObject({
      path,
      bytes: 6,
      fileSynced: true,
      directorySynced: !IS_WINDOWS,
    });
    expect(() => writeFileOnceDurably(path, 'second\n')).toThrow(WriteOnceCollisionError);
    expect(readFileSync(path, 'utf8')).toBe('first\n');
    expect(readdirSync(dir)).toEqual(['a.json']);
  });

  it('an envelope carries a deterministic record hash the reader recomputes; tampering, wrong kind, missing and unparsable are distinct failures', () => {
    const dir = join(SCRATCH, 'envelope');
    mkdirSync(dir);
    const { envelope } = writeArtifactOnce(dir, 'PLANNED_INPUT', { b: 2, a: 1 });
    expect(envelope.artifactVersion).toBe(RUNNER_ARTIFACT_VERSION);
    expect(envelope.recordSha256).toBe(sha256Hex('{"a":1,"b":2}'));
    expect(envelopeOf('PLANNED_INPUT', { a: 1, b: 2 }).recordSha256).toBe(envelope.recordSha256);
    const read = readArtifact<{ a: number }>(dir, 'PLANNED_INPUT');
    expect(read.ok && read.envelope.record.a).toBe(1);
    expect(readArtifact(dir, 'CHILD_RESULT')).toMatchObject({ ok: false, failure: 'MISSING' });
    const path = join(dir, ARTIFACT_FILE_NAMES.PLANNED_INPUT);
    writeFileSync(path, readFileSync(path, 'utf8').replace('"a": 1', '"a": 2'));
    expect(readArtifact(dir, 'PLANNED_INPUT')).toMatchObject({
      ok: false,
      failure: 'HASH_MISMATCH',
    });
    writeFileSync(path, readFileSync(path, 'utf8').replace('"PLANNED_INPUT"', '"CHILD_RESULT"'));
    expect(readArtifact(dir, 'PLANNED_INPUT')).toMatchObject({ ok: false, failure: 'WRONG_KIND' });
    writeFileSync(path, '{not json');
    expect(readArtifact(dir, 'PLANNED_INPUT')).toMatchObject({ ok: false, failure: 'UNPARSABLE' });
    writeFileSync(path, '{"artifactKind":"PLANNED_INPUT"}');
    expect(readArtifact(dir, 'PLANNED_INPUT')).toMatchObject({ ok: false, failure: 'WRONG_SHAPE' });
    expect(ARTIFACT_KINDS.length).toBe(Object.keys(ARTIFACT_FILE_NAMES).length);
    expect(new Set(Object.values(ARTIFACT_FILE_NAMES)).size).toBe(ARTIFACT_KINDS.length);
  });

  it('attempt identity is variant / frozen ordinal / operator attemptNo, and rejects non-positive values', () => {
    expect(attemptDirectoryOf('/out', 'PROMPT_V2_CANONICAL', 9, 3)).toBe(
      join('/out', 'evaluations', 'PROMPT_V2_CANONICAL', 'batch-09', 'attempt-3'),
    );
    expect(() => attemptDirectoryOf('/out', 'PROMPT_V1_CANONICAL', 0, 1)).toThrow(RangeError);
    expect(() => attemptDirectoryOf('/out', 'PROMPT_V1_CANONICAL', 1, 0)).toThrow(RangeError);
  });

  it('the output root must be absolute, normalised, existing, real and outside every repository worktree', () => {
    const probes = {
      realpath: (p: string) => realpathSync.native(p),
      isDirectory: (p: string) => existsSync(p) && lstatSync(p).isDirectory(),
    };
    const good = join(SCRATCH, 'good-output');
    mkdirSync(good);
    expect(validateOutputRoot(good, [ROOT], probes)).toEqual({ ok: true, outputRoot: good });
    expect(validateOutputRoot('relative/out', [ROOT], probes)).toMatchObject({
      ok: false,
      refusal: 'NOT_ABSOLUTE',
    });
    expect(validateOutputRoot(`${SCRATCH}/../x`, [ROOT], probes)).toMatchObject({
      ok: false,
      refusal: 'TRAVERSAL_SEGMENT',
    });
    expect(validateOutputRoot(join(SCRATCH, 'missing'), [ROOT], probes)).toMatchObject({
      ok: false,
      refusal: 'NOT_A_DIRECTORY',
    });
    const link = join(SCRATCH, 'link-output');
    symlinkSync(good, link);
    expect(validateOutputRoot(link, [ROOT], probes)).toMatchObject({
      ok: false,
      refusal: 'SYMLINK_COMPONENT',
    });
    const inside = join(ROOT, 'dist');
    if (existsSync(inside))
      expect(validateOutputRoot(inside, [ROOT], probes)).toMatchObject({
        ok: false,
        refusal: 'INSIDE_REPOSITORY',
      });
    expect(validateOutputRoot(good, [ROOT, SCRATCH], probes)).toMatchObject({
      ok: false,
      refusal: 'INSIDE_REPOSITORY',
    });
    expect(validateOutputRoot(ROOT, [ROOT], probes)).toMatchObject({
      ok: false,
      refusal: 'INSIDE_REPOSITORY',
    });
  });
});

describe('2D2C-F1 isolation: source-level boundaries of the runner namespace', () => {
  it('no runner module or the loader imports a database, a socket or fetch()', () => {
    for (const file of [...harnessFiles(), LOADER, 'src/test/harness/processIsolatedBatch.ts']) {
      const source = code(file);
      expect(source, `${file} imports pg`).not.toMatch(/from\s+['"]pg['"]/);
      expect(source, `${file} imports the db helpers`).not.toMatch(/\/db\//);
      expect(source, `${file} opens a socket`).not.toMatch(
        /from\s+['"]node:(net|tls|http|https|dns)['"]/,
      );
      expect(source, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${file} imports the SDK`).not.toContain('@anthropic-ai/');
    }
  });

  it('only the execution-only loader names the production runner factories, and it is reached only from the child entry, dynamically, after the preflight', () => {
    const loader = code(LOADER);
    expect(loader).toMatch(/createProduction[A-Za-z]+Runner\(\)/);
    expect(loader).not.toContain('process.env');
    expect(loader).not.toMatch(/\bdebug\s*:/);
    expect(loader).not.toMatch(/\bdebugFile\s*:/);
    // Type-only imports are erased; no VALUE import of the production namespace exists in the loader.
    expect(loader).not.toMatch(
      /^\s*import\s+(?!type\b)[^;]*from\s+['"]\.\.\/src\/orgunits\/[^'"]*['"];/m,
    );
    for (const file of harnessFiles()) {
      if (file.endsWith('childEntry.mjs')) continue;
      expect(code(file), `${file} references the production loader`).not.toContain(
        'phase2b-2d2c-production-runtime',
      );
    }
    const entry = code(`${HARNESS_DIR}/childEntry.mjs`);
    const loaderImports =
      entry.match(/import\(\s*['"][^'"]*phase2b-2d2c-production-runtime[^'"]*['"]\s*\)/g) ?? [];
    expect(loaderImports).toHaveLength(1);
    expect(entry.indexOf('providerFactory')).toBeLessThan(entry.indexOf(loaderImports[0]!));
    expect(entry).not.toMatch(/^\s*import\s+[^;]*production-runtime/m);
    const cli = code(`${HARNESS_DIR}/cli.ts`);
    expect(cli).not.toContain('production-runtime');
    expect(cli).not.toContain('childMain');
  });

  it('the lock has no alternate path: the CLI reads no bypass variable and the coordinator reads no environment at all', () => {
    const cli = code(`${HARNESS_DIR}/cli.ts`);
    const envReads = cli.match(/process\.env/g) ?? [];
    expect(envReads).toHaveLength(1);
    expect(cli).toMatch(/env: \{ \.\.\.process\.env \}/);
    for (const file of [
      'coordinator.ts',
      'authorisation.ts',
      'stopConditions.ts',
      'artifacts.ts',
      'childEnvironment.ts',
      'batches.ts',
      'plan.ts',
      'freeze.ts',
      'corpus.ts',
    ]) {
      expect(code(`${HARNESS_DIR}/${file}`), `${file} reads process.env`).not.toContain(
        'process.env',
      );
    }
    expect(cli).not.toMatch(/--(force|bypass|skip|no-lock|unsafe)/);
  });
});

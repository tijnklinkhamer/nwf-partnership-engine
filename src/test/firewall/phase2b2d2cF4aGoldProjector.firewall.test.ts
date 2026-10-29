/**
 * PHASE 2B-2D2C-F4A FIREWALL — THE PROJECTOR, THE FIXTURE AND THE SUPPLEMENT
 * STAY ON THE SCORING SIDE OF THE LINE.
 *
 * Three separate boundaries, each of which would be easy to erode by
 * accident:
 *
 *   1. The projector is a READ-AND-SELECT tool. It must be unable to reach
 *      inference, credentials, a database, a child process or the execution
 *      CLI — and, specifically, it must not be able to `JSON.parse` a record
 *      before deciding whether that record is allowed.
 *   2. The DEVELOPMENT label fixture is SCORING-ONLY gold. Production code
 *      must not be able to import it, and the inference runner must not be
 *      able to load it — a prompt that could see its own answer key would
 *      invalidate every future attempt.
 *   3. The scoring supplement is a POST-INFERENCE document. The F0B freeze
 *      must not reference it, and the runner must not read it, or attempt 1
 *      would appear to have run under a configuration that did not exist
 *      when it ran.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const PROJECTOR_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d2c/goldProjection');
const PRODUCTION_DIR = join(REPO_ROOT, 'src');

const DEV_LABEL_FIXTURE =
  'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-dev-labels-v1.jsonl';
const SCORING_SUPPLEMENT = 'docs/evaluation/PHASE_2B_2D2C_DEV_SCORING_SUPPLEMENT_V1.json';
const FREEZE = 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json';

/** Modules that can reach inference, credentials, a database or a process. */
const FORBIDDEN_MODULES = [
  'src/test/harness/phase2b2d2c/cli.ts',
  'src/test/harness/phase2b2d2c/coordinator.ts',
  'src/test/harness/phase2b2d2c/childMain.ts',
  'src/test/harness/phase2b2d2c/childEnvironment.ts',
  'src/test/harness/phase2b2d2c/runtimeLoader.ts',
  'src/test/harness/phase2b2d2c/variantRoot.ts',
  'src/test/harness/phase2b2d2c/variantRootProbes.ts',
  'src/test/harness/phase2b2d2c/authorisation.ts',
  'src/test/harness/processIsolatedBatch.ts',
  'src/orgunits/classify/provider',
  'src/orgunits/classify/loaders.ts',
  'src/orgunits/classify/persist.ts',
  'src/orgunits/classify/orchestrate.ts',
  'src/db/',
  'src/orgunits/web/gateway.ts',
  'src/orgunits/web/robots.ts',
  'src/orgunits/orchestrator/',
];

const FORBIDDEN_NODE_MODULES = [
  'node:child_process',
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dns',
  'node:worker_threads',
  'node:cluster',
];

const FORBIDDEN_PACKAGES = ['pg', '@anthropic-ai/claude-agent-sdk', '@anthropic-ai/sdk'];

const FORBIDDEN_IDENTIFIERS = [
  'AgentSdkRunner',
  'evaluateExecutionLock',
  'isAuthorisationConsumed',
  'runExperiment',
  'runProcessIsolatedBatch',
  'authStatus',
  'createProvider',
  'query(',
  'spawn(',
  'execFile',
  'execSync',
  'fetch(',
  '--execute',
];

function importSpecifiersOf(source: string): readonly string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bimport\s+[^;]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
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

function transitiveGraph(entryPoints: readonly string[]): {
  files: readonly string[];
  externalSpecifiers: readonly string[];
} {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = [...entryPoints];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readFileSync(file, 'utf8'))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) external.add(specifier);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return { files: [...visited].sort(), externalSpecifiers: [...external].sort() };
}

function walkTypeScript(directory: string): readonly string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory).sort()) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'test') continue;
      found.push(...walkTypeScript(full));
    } else if (entry.endsWith('.ts')) found.push(full);
  }
  return found;
}

const PROJECTOR_FILES = readdirSync(PROJECTOR_DIR)
  .sort()
  .filter((name) => name.endsWith('.ts'))
  .map((name) => join(PROJECTOR_DIR, name));

describe('the gold projector cannot reach inference, credentials, a database or a process', () => {
  const graph = transitiveGraph(PROJECTOR_FILES);

  it('reaches a real import graph', () => {
    expect(PROJECTOR_FILES.length).toBeGreaterThanOrEqual(3);
    expect(graph.files.length).toBeGreaterThan(PROJECTOR_FILES.length);
  });

  it('imports no execution, provider, loader, orchestrator or database module', () => {
    for (const file of graph.files) {
      for (const forbidden of FORBIDDEN_MODULES) {
        const forbiddenFile = join(REPO_ROOT, forbidden);
        expect(
          file === forbiddenFile || file.startsWith(forbiddenFile),
          `${file.slice(REPO_ROOT.length + 1)} is reachable from the projector (${forbidden}).`,
        ).toBe(false);
      }
    }
  });

  it('imports no socket, child-process or provider package', () => {
    for (const specifier of graph.externalSpecifiers) {
      expect(FORBIDDEN_NODE_MODULES).not.toContain(specifier);
      expect(FORBIDDEN_PACKAGES).not.toContain(specifier);
      expect(specifier.startsWith('@anthropic-ai/')).toBe(false);
    }
  });

  it('names no inference, authentication or process-spawning capability', () => {
    for (const file of PROJECTOR_FILES) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(code.includes(identifier), `${file} names ${identifier}`).toBe(false);
      }
    }
  });
});

describe('membership is decided before deserialization, and discards are silent', () => {
  it('gives the routing module no way to deserialize a record', () => {
    const router = join(PROJECTOR_DIR, 'routeGoldId.ts');
    const code = readFileSync(router, 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '');
    for (const forbidden of ['JSON.parse', 'JSON.stringify', 'Schema', 'zod']) {
      expect(code.includes(forbidden), `routeGoldId.ts names ${forbidden}`).toBe(false);
    }
  });

  it('gives the SELECTION modules no logging or standard-output channel', () => {
    // projectCli.ts is excluded deliberately, and structurally rather than by
    // convenience: it receives an already-filtered ProjectionResult whose
    // `selected` array holds only allowlisted records, so a discarded record
    // has been out of scope since project.ts dropped it and can never reach a
    // print statement here. The modules that DO see a discarded record —
    // routeGoldId.ts, project.ts, allowlist.ts — hold no output channel at all.
    for (const file of PROJECTOR_FILES.filter((path) => !path.endsWith('projectCli.ts'))) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      for (const channel of ['console.', 'process.stdout', 'process.stderr']) {
        expect(code.includes(channel), `${file} writes to ${channel}`).toBe(false);
      }
    }
  });

  it('lets the runner print only counts and hashes, never a record', () => {
    const code = readFileSync(join(PROJECTOR_DIR, 'projectCli.ts'), 'utf8');
    const writes = [...code.matchAll(/process\.stdout\.write\(([^;]*)\);/g)].map((m) => m[1] ?? '');
    expect(writes.length).toBeGreaterThan(0);
    for (const argument of writes) {
      for (const forbidden of [
        'rawLine',
        '.item',
        'selected[',
        'rationale',
        'ambiguity',
        'proposed',
      ]) {
        expect(argument.includes(forbidden), `the runner prints ${forbidden}`).toBe(false);
      }
    }
  });

  it("refuses to open the source without the owner's exact statement", async () => {
    const { authorisationMatches, REQUIRED_AUTHORISATION } =
      await import('../harness/phase2b2d2c/goldProjection/projectCli.js');
    expect(authorisationMatches(REQUIRED_AUTHORISATION)).toBe(true);
    for (const paraphrase of [
      'go',
      'approved',
      'continue',
      'I AUTHORISE THE PROJECTION',
      REQUIRED_AUTHORISATION.replace('NO DATABASE.', ''),
      REQUIRED_AUTHORISATION.replace('49', '72'),
    ]) {
      expect(authorisationMatches(paraphrase), `${paraphrase.slice(0, 40)} was accepted`).toBe(
        false,
      );
    }
  });

  it('gives the selection modules no way to write a file', () => {
    for (const file of PROJECTOR_FILES) {
      if (file.endsWith('projectCli.ts')) continue;
      const code = readFileSync(file, 'utf8').replace(/\/\*\*[\s\S]*?\*\//g, '');
      expect(
        /\b(writeFileSync|appendFileSync|createWriteStream|rmSync|unlinkSync|renameSync)\b/.test(
          code,
        ),
        `${file} can write`,
      ).toBe(false);
    }
  });
});

describe('the DEVELOPMENT label fixture and the scoring supplement stay out of inference', () => {
  it('is imported or named by no production module', () => {
    for (const file of walkTypeScript(PRODUCTION_DIR)) {
      const source = readFileSync(file, 'utf8');
      expect(source.includes(DEV_LABEL_FIXTURE), `${file} names the DEV label fixture`).toBe(false);
      expect(source.includes(SCORING_SUPPLEMENT), `${file} names the scoring supplement`).toBe(
        false,
      );
    }
  });

  it('is named by no module the inference runner can reach', () => {
    const runnerEntryPoints = [
      'src/test/harness/phase2b2d2c/cli.ts',
      'src/test/harness/phase2b2d2c/coordinator.ts',
      'src/test/harness/phase2b2d2c/childMain.ts',
    ]
      .map((relative) => join(REPO_ROOT, relative))
      .filter((file) => existsSync(file));
    expect(runnerEntryPoints.length).toBeGreaterThan(0);
    for (const file of transitiveGraph(runnerEntryPoints).files) {
      const source = readFileSync(file, 'utf8');
      expect(source.includes(DEV_LABEL_FIXTURE), `${file} names the DEV label fixture`).toBe(false);
      expect(source.includes(SCORING_SUPPLEMENT), `${file} names the scoring supplement`).toBe(
        false,
      );
      expect(
        source.includes('goldProjection'),
        `${file} reaches the projector from the inference runner`,
      ).toBe(false);
    }
  });

  it('is not referenced by the F0B inference freeze', () => {
    const freeze = readFileSync(join(REPO_ROOT, FREEZE), 'utf8');
    expect(freeze.includes(DEV_LABEL_FIXTURE)).toBe(false);
    expect(freeze.includes(SCORING_SUPPLEMENT)).toBe(false);
    expect(freeze.includes('SCORING_SUPPLEMENT')).toBe(false);
  });

  it('keeps the F0B freeze at its frozen raw hash', async () => {
    const { createHash } = await import('node:crypto');
    const raw = readFileSync(join(REPO_ROOT, FREEZE));
    expect(createHash('sha256').update(raw).digest('hex')).toBe(
      'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157',
    );
  });
});

/**
 * PHASE 2B-2D2C-F0X FIREWALL — NARROW, EXACT EXECUTION REACHABILITY.
 *
 * Unlike F0W, F0X legitimately reaches the existing coordinator/Tier-2/
 * provider execution path — that is its whole job. This firewall proves
 * the reachability is NARROW and EXACT by walking the transitive import
 * graph from every file under `src/test/harness/phase2b2d2c/f0x/`:
 *
 *   - it MUST reach `coordinator.ts` (`runExperiment`) and, through it,
 *     `childMain.ts` and the provider path already used by approved
 *     attempts 3/4 — proven by requiring specific files/identifiers to be
 *     present in the graph, not merely absent from a forbidden list;
 *   - it must NEVER reach scoring, DEV/HOLDOUT gold or adjudication
 *     loaders, the `v3d1`/`goldProjection` namespaces, a database client
 *     or migration, an unrelated network surface, or any V6/future-prompt
 *     module.
 *
 * It also proves the CLI's closed flag set carries no slot-order escape
 * (`--skip-slot`/`--start-at`/`--only-slot`/`--continue-from`/variant or
 * output-root override), and that every file physically present under
 * `f0x/` is one this firewall actually walks.
 *
 * These assertions walk real capabilities — module specifiers, exported
 * symbol names, file paths — never ordinary English words, following the
 * exact pattern `phase2b2d2cF0WReadiness.firewall.test.ts` and
 * `phase2b2d2cF4Scorer.firewall.test.ts` already established.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const F0X_DIR = join(REPO_ROOT, 'src/test/harness/phase2b2d2c/f0x');

const ENTRY_POINTS = readdirSync(F0X_DIR)
  .filter((name) => name.endsWith('.ts'))
  .sort();

/** Files/namespaces the execution-integration layer MUST be able to reach — its whole job. */
const REQUIRED_REACHABLE_FILES = [
  'src/test/harness/phase2b2d2c/coordinator.ts',
  'src/test/harness/phase2b2d2c/childMain.ts',
];

/**
 * Namespaces/files that must NEVER be reachable from the execution-integration
 * layer. `evaluation/goldSchema.ts` and `evaluation/hashes.ts` are
 * DELIBERATELY not listed here: they are the shared corpus-ROW schema
 * (document shape, split/strata enums) and the PURE reproducibility-hash
 * helpers that `corpus.ts`/`batches.ts` — reached transitively through the
 * already-approved `childMain.ts` itself, unmodified by F0X — already use
 * to verify the frozen DEVELOPMENT corpus. Neither carries scoring, gold
 * LABEL loading or adjudication logic; those live in the seven files below,
 * which remain forbidden.
 */
const FORBIDDEN_MODULES = [
  'src/test/harness/phase2b2d2c/scoring/',
  'src/test/harness/phase2b2d2c/goldProjection/',
  'src/test/harness/phase2b2d2c/v3d1/',
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

/** Capability identifiers that would mean scoring, gold/HOLDOUT access, or a slot-order escape. */
const FORBIDDEN_IDENTIFIERS = [
  'loadDevGold',
  'loadHoldout',
  'loadAdjudicat',
  'HOLDOUT',
  'goldProjection',
  '--skip-slot',
  '--start-at',
  '--only-slot',
  '--continue-from',
  '--variant-override',
  '--slot-order',
  '--output-root-override',
];

function readSource(path: string): string {
  return readFileSync(path, 'utf8');
}

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

/** Every .ts file reachable from the f0x entry points. */
function transitiveGraph(): { files: readonly string[]; externalSpecifiers: readonly string[] } {
  const visited = new Set<string>();
  const external = new Set<string>();
  const queue = ENTRY_POINTS.map((name) => join(F0X_DIR, name));
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importSpecifiersOf(readSource(file))) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved === null) external.add(specifier);
      else if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return { files: [...visited].sort(), externalSpecifiers: [...external].sort() };
}

describe('2D2C-F0X: narrow, exact execution reachability', () => {
  const graph = transitiveGraph();

  it('reaches a non-trivial import graph (so the walk is really walking)', () => {
    expect(graph.files.length).toBeGreaterThan(5);
    for (const entry of ENTRY_POINTS) expect(graph.files).toContain(join(F0X_DIR, entry));
  });

  it('every f0x/*.ts file is on the ENTRY_POINTS list this firewall walks', () => {
    const onDisk = readdirSync(F0X_DIR)
      .filter((name) => name.endsWith('.ts'))
      .sort();
    expect(onDisk).toEqual(ENTRY_POINTS);
  });

  it("DOES reach the existing coordinator/Tier-2 execution path — this is F0X's whole job", () => {
    for (const required of REQUIRED_REACHABLE_FILES) {
      const requiredFile = join(REPO_ROOT, required);
      expect(
        graph.files.some((file) => file === requiredFile || file.startsWith(requiredFile)),
        `expected the f0x graph to reach ${required}, but it did not.`,
      ).toBe(true);
    }
  });

  it('never reaches scoring, gold/HOLDOUT, v3d1/goldProjection, a database client, a migration, or an orchestrator/frontier module', () => {
    for (const file of graph.files) {
      const relative = file.slice(REPO_ROOT.length + 1);
      for (const forbidden of FORBIDDEN_MODULES) {
        const forbiddenFile = join(REPO_ROOT, forbidden);
        expect(
          file === forbiddenFile || file.startsWith(forbiddenFile),
          `${relative} is reachable from f0x/ but is a forbidden module (${forbidden}).`,
        ).toBe(false);
      }
    }
  });

  it('imports no raw socket module and no direct database driver', () => {
    for (const specifier of graph.externalSpecifiers) {
      expect(FORBIDDEN_NODE_MODULES).not.toContain(specifier);
      expect(FORBIDDEN_PACKAGES).not.toContain(specifier);
    }
  });

  it('names no gold/HOLDOUT loader and no slot-order-escape flag anywhere in f0x/ source', () => {
    for (const name of ENTRY_POINTS) {
      const source = readSource(join(F0X_DIR, name));
      const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        expect(code.includes(identifier), `${name} names ${identifier}`).toBe(false);
      }
    }
  });

  it('opens no file the F0V freeze lists as HOLDOUT-forbidden', () => {
    const freeze: unknown = JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'docs/evaluation/PHASE_2B_2D2C_DEV_REPLICATION_STUDY_FREEZE_F0V_V1.json'),
        'utf8',
      ),
    );
    const forbiddenFiles = (freeze as { holdout: { forbiddenFiles: string[] } }).holdout
      .forbiddenFiles;
    expect(forbiddenFiles.length).toBeGreaterThan(0);
    for (const file of graph.files) {
      const source = readSource(file);
      const readCalls = [...source.matchAll(/read(?:File|dir)Sync\s*\(([^)]*)\)/g)].map(
        (m) => m[1] ?? '',
      );
      for (const path of forbiddenFiles) {
        for (const argument of readCalls) {
          expect(argument.includes(path), `${file} reads ${path}`).toBe(false);
        }
      }
    }
  });

  it('the study-execution CLI parser has no --skip-slot/--start-at/--only-slot/--continue-from/variant/slot-order/output-root override flag', () => {
    const source = readSource(join(F0X_DIR, 'cliF0X.ts'));
    const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of [
      '--skip-slot',
      '--start-at',
      '--only-slot',
      '--continue-from',
      '--variant-override',
      '--slot-order',
      '--output-root-override',
    ]) {
      expect(code).not.toContain(forbidden);
    }
  });

  it("the study-execution CLI processes slots ONLY in the registry's own frozen order (no operator-supplied ordering parameter reaches the executor)", () => {
    const executorSource = readSource(join(F0X_DIR, 'studyExecutor.ts'));
    const code = executorSource.replace(/\/\*\*[\s\S]*?\*\//g, '');
    // The loop must walk `registry.slots` directly — never a caller-supplied
    // subset or reordering of it.
    expect(code).toMatch(/for \(const \[index, slot\] of input\.registry\.slots\.entries\(\)\)/);
  });

  it('never imports a V6 or future-prompt module', () => {
    for (const specifier of graph.externalSpecifiers) {
      expect(specifier.toLowerCase()).not.toContain('v6');
    }
    // PHASE 2B-2D2C-F4 — a DELIBERATE, EXACT-NAME widening, not a relaxation.
    // The Tier-2 child is shared by every study, and F4 taught its freeze-family
    // boundary (`f0c/freezeFamily.ts`) to recognise the owner-approved F2
    // final-V6 study freeze BY HASH. So the ONE child-facing, pure study-context
    // module is now reachable from f0x/ — transitively, through the child, and
    // through nothing else. What this test protects is unchanged and is asserted
    // directly below: no f0x/*.ts file imports any V6 or F4 module itself, the
    // widened module is the only V6-named file reachable, and it is reached only
    // because freezeFamily.ts imports it.
    const CHILD_FACING_F4_STUDY_CONTEXT = 'src/test/harness/phase2b2d2c/f4/v6StudyContextF4.ts';
    for (const file of graph.files) {
      const relative = file.slice(REPO_ROOT.length + 1);
      if (relative === CHILD_FACING_F4_STUDY_CONTEXT) continue;
      expect(relative.toLowerCase()).not.toContain('v6');
      expect(relative).not.toContain('/f4/');
    }
    for (const name of ENTRY_POINTS) {
      const specifiers = importSpecifiersOf(readSource(join(F0X_DIR, name)));
      for (const specifier of specifiers) {
        expect(specifier.toLowerCase(), `${name} imports ${specifier}`).not.toContain('v6');
        expect(specifier, `${name} imports ${specifier}`).not.toContain('/f4/');
      }
    }
    const importersOfWidened = graph.files.filter((file) =>
      importSpecifiersOf(readSource(file)).some((specifier) =>
        specifier.endsWith('/f4/v6StudyContextF4.js'),
      ),
    );
    // PHASE 2B-2D2C-F7 — a second DELIBERATE, EXACT-NAME widening, of the same
    // kind: the child's freeze-family boundary now also recognises the
    // owner-approved F6 restart freeze BY HASH, through ONE pure, child-facing
    // F7 study-context module, which itself builds on the F4 context. It is the
    // only f7/ module reachable from f0x/, and only freezeFamily.ts and
    // childMain.ts import it.
    const CHILD_FACING_F7_STUDY_CONTEXT =
      'src/test/harness/phase2b2d2c/f7/restartStudyContextF7.ts';
    expect(importersOfWidened.map((file) => file.slice(REPO_ROOT.length + 1)).sort()).toEqual([
      'src/test/harness/phase2b2d2c/childMain.ts',
      'src/test/harness/phase2b2d2c/f0c/freezeFamily.ts',
      CHILD_FACING_F7_STUDY_CONTEXT,
    ]);
    expect(
      graph.files
        .map((file) => file.slice(REPO_ROOT.length + 1))
        .filter((relative) => relative.includes('/f7/')),
    ).toEqual([CHILD_FACING_F7_STUDY_CONTEXT]);
    const importersOfF7Context = graph.files.filter((file) =>
      importSpecifiersOf(readSource(file)).some((specifier) =>
        specifier.endsWith('/f7/restartStudyContextF7.js'),
      ),
    );
    expect(importersOfF7Context.map((file) => file.slice(REPO_ROOT.length + 1)).sort()).toEqual([
      'src/test/harness/phase2b2d2c/childMain.ts',
      'src/test/harness/phase2b2d2c/f0c/freezeFamily.ts',
    ]);
  });
});

describe('2D2C-F0X recovery-1: a narrow, pinned, request-free recovery surface', () => {
  const codeOf = (name: string): string =>
    readSource(join(F0X_DIR, name))
      .replace(/\/\*\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('the production CLI and the materialiser obtain the overlay ONLY through the pinned loader, never the test-only seam', () => {
    for (const name of ['cliF0X.ts', 'materialiseRecovery1.ts', 'studyExecutor.ts']) {
      expect(codeOf(name)).not.toContain('parseRecovery1OverlayForTestOnly');
    }
    expect(codeOf('cliF0X.ts')).toContain('loadRecovery1OverlayFromBytes');
  });

  it('the recovery study root and control directory are literal ONLY in the overlay module — never a CLI flag or a second copy', () => {
    for (const name of ENTRY_POINTS.filter((entry) => entry !== 'recovery1Overlay.ts')) {
      expect(codeOf(name), name).not.toContain('replication-v4-v5-n5-recovery-1');
    }
    const cli = codeOf('cliF0X.ts');
    for (const flag of ['--study-root', '--recovery-root', '--control-dir', '--output-root']) {
      expect(cli).not.toContain(flag);
    }
  });

  it('the materialiser has no execution path: it never calls the executor, runExperiment, a launcher or the Tier-2 harness', () => {
    const code = codeOf('materialiseRecovery1.ts');
    for (const forbidden of [
      'runReplicationStudyExecution',
      'runExperiment',
      'createF0XProductionLauncher',
      'runProcessIsolatedBatch',
      '.launch(',
      'writeOuterSlotIdentity',
      'writeStudyManifest',
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('the materialiser never overwrites: every writeFileSync is write-exclusive, and every mkdirSync is non-recursive', () => {
    const code = codeOf('materialiseRecovery1.ts');
    const writes = [...code.matchAll(/writeFileSync\(([\s\S]*?)\);/g)].map((m) => m[1] ?? '');
    expect(writes.length).toBeGreaterThanOrEqual(3);
    for (const call of writes) expect(call).toContain("flag: 'wx'");
    expect(code).not.toMatch(/mkdirSync\([^)]*recursive/);
    expect(code).not.toMatch(/\b(rmSync|unlinkSync|renameSync|appendFileSync)\b/);
  });

  it('the recovery lock refuses spent candidates by hash BEFORE parsing, and both recovery schemas are closed and versioned apart from the originals', () => {
    const code = codeOf('recovery1Authority.ts');
    const spentCheck = code.indexOf('SPENT_CANDIDATE_PRESENTED');
    const firstParse = code.indexOf('JSON.parse(bytes');
    expect(spentCheck).toBeGreaterThan(0);
    expect(spentCheck).toBeLessThan(firstParse);
    expect(code).toContain("'phase2b-2d2c-f0x-recovery-1-slot-authorisation-v1'");
    expect(code).toContain("'phase2b-2d2c-f0x-recovery-1-study-execution-approval-v1'");
    expect(code).not.toContain('.passthrough(');
    expect(code).not.toContain('.loose(');
  });
});

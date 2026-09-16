/**
 * PHASE 2B-2D2C-F0X ZERO-INFERENCE EXECUTION-RECOVERY CORRECTION.
 *
 * The first real F0X study invocation (2026-09-16) consumed all ten slot
 * candidates and produced zero inference. Two defects, both confirmed
 * against the committed code and the preserved evidence:
 *
 *   DEFECT 1 — every child manifest carried the RELATIVE historical freeze
 *   path; the Tier-2 child runs with its scratch directory as cwd, so all
 *   ten children refused at `freeze` with ENOENT.
 *   DEFECT 2 — the executor labelled any returned experiment (STOPPED
 *   included) Class C and advanced, and the sequencing classifier read
 *   parent/child control-plane files as semantic execution.
 *
 * This file proves both root causes and both fixes:
 *
 *   1. `resolveChildFreezePath` — canonical absolute, hash-verified, refuses
 *      every malformed input.
 *   2. PHYSICAL, through the REAL Tier-2 harness (real fork, real scratch
 *      cwd, real `childEntry.mjs`), for BOTH V4 and V5, via the executor's
 *      own `buildSlotExperimentInput`: the absolute path gets past `freeze`;
 *      the pre-fix relative path reproduces the PRESERVED child-preflight
 *      record byte-for-byte.
 *   3. PHYSICAL, provider-construction boundary: the real child with only
 *      its provider factory replaced by a throwing no-provider seam, against
 *      the REAL frozen V4/V5 runtime roots (machine-local; skipped where they
 *      are absent) — full preflight passes, `providerConstructed: false`, the
 *      seam is reached, and the corrected classifier reads that root as
 *      AMBIGUOUS (fail closed), never Class C.
 *   4. The corrected classification: the exact preserved failure shape is
 *      Class B while reading ONLY child-preflight files; Class B blocks the
 *      next slot; real markers are Class C; Class C must be durably closed;
 *      every ambiguous shape blocks.
 *
 * `F0V_STUDY_ROOT` is mocked to a temporary directory; the real root, which
 * holds the preserved study, is never written (proven by hash snapshot).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type * as FreezeF0VModule from '../harness/phase2b2d2c/f0v/freezeF0V.js';

vi.mock('../harness/phase2b2d2c/f0v/freezeF0V.js', async (importOriginal) => {
  const { mkdtempSync, realpathSync: realpath } = await import('node:fs');
  const { tmpdir: osTmpdir } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const root = realpath.native(
    mkdtempSync(joinPath(osTmpdir(), 'nwf-pe-f0x-zero-inference-recovery-')),
  );
  const actual = await importOriginal<typeof FreezeF0VModule>();
  return { ...actual, F0V_STUDY_ROOT: root };
});

import { snapshotTreeSha256 } from '../helpers/treeSnapshot.js';
import {
  attemptDirectoryOf,
  envelopeOf,
  serializeEnvelope,
} from '../harness/phase2b2d2c/artifacts.js';
import { CHILD_ENTRY_PATH } from '../harness/phase2b2d2c/cli.js';
import { runExperiment, type ChildLauncher } from '../harness/phase2b2d2c/coordinator.js';
import {
  buildF0IExecutionPlan,
  F0I_FREEZE_PATH,
  loadF0IFreezeFromBytes,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  V4_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import {
  buildF0OExecutionPlan,
  F0O_FREEZE_PATH,
  loadF0OFreezeFromBytes,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  V5_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import { F0V_FREEZE_PATH, F0V_STUDY_ROOT } from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  futureOutputRootPathOf,
  sha256Hex,
  type StudySlotIdentity,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import type { F0WSlotExecutionAuthorisation } from '../harness/phase2b2d2c/f0w/authorisationF0W.js';
import {
  classifySlotEvidence,
  evaluateSequencingGate,
  inclusionClassOf,
  type SlotEvidenceProbes,
} from '../harness/phase2b2d2c/f0w/sequencing.js';
import {
  buildSlotExecutionPlanTemplate,
  type SlotExecutionPlanTemplate,
} from '../harness/phase2b2d2c/f0w/slotExecutionPlan.js';
import { loadStudySlotRegistry } from '../harness/phase2b2d2c/f0w/slotRegistry.js';
import {
  ChildFreezePathError,
  resolveChildFreezePath,
} from '../harness/phase2b2d2c/f0x/childFreezePath.js';
import {
  buildFailedStudyInventory,
  createReadOnlyInventoryProbes,
} from '../harness/phase2b2d2c/f0x/failedStudyInventory.js';
import {
  buildSlotExperimentInput,
  type StudyExecutorInput,
} from '../harness/phase2b2d2c/f0x/studyExecutor.js';
import { runProcessIsolatedBatch } from '../harness/processIsolatedBatch.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const REAL_F0V_STUDY_ROOT_STRING =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5';
const REAL_STUDY_ROOT_AT_LOAD = snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING);

/**
 * The frozen V4/V5 runtime roots the preserved study's own experiment
 * manifests name. Machine-local: the provider-boundary proof runs only where
 * both exist at their frozen commits.
 */
const REAL_V4_RUNTIME_ROOT = '/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-runtime-v4-f0i';
const REAL_V5_RUNTIME_ROOT =
  '/Users/tijnklinkhamer/Developer/wt-phase2b-2d2c-v5i1-whole-org-base-scope';
const NO_PROVIDER_CHILD_ENTRY = join(
  ROOT,
  'src/test/fixtures/phase2b2d2c/noProviderChildEntry.mjs',
);
const NO_PROVIDER_SEAM_SENTINEL = 'NO_PROVIDER_SEAM_REACHED_PROVIDER_NOT_CONSTRUCTED';

function headOf(root: string): string | null {
  try {
    return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}
const REAL_RUNTIME_ROOTS_AVAILABLE =
  !IS_WINDOWS &&
  existsSync(REAL_V4_RUNTIME_ROOT) &&
  existsSync(REAL_V5_RUNTIME_ROOT) &&
  headOf(REAL_V4_RUNTIME_ROOT) === V4_RUNTIME_COMMIT &&
  headOf(REAL_V5_RUNTIME_ROOT) === V5_RUNTIME_COMMIT;

const registry = loadStudySlotRegistry(readFileSync(join(ROOT, F0V_FREEZE_PATH)));
const f0i = loadF0IFreezeFromBytes(readFileSync(join(ROOT, F0I_FREEZE_PATH)));
const f0o = loadF0OFreezeFromBytes(readFileSync(join(ROOT, F0O_FREEZE_PATH)));
const F0I_PLAN = buildF0IExecutionPlan(f0i.freeze, f0i.rawSha256);
const F0O_PLAN = buildF0OExecutionPlan(f0o.freeze, f0o.rawSha256);
const PAIR_1_V4 = F0V_SLOTS[0]!;
const PAIR_1_V5 = F0V_SLOTS[1]!;
const readFile = (path: string): Buffer => readFileSync(path);

afterEach(() => {
  for (const slot of F0V_SLOTS) {
    rmSync(futureOutputRootPathOf(F0V_STUDY_ROOT, slot), { recursive: true, force: true });
  }
});

afterAll(() => {
  rmSync(F0V_STUDY_ROOT, { recursive: true, force: true });
  expect(snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING)).toEqual(REAL_STUDY_ROOT_AT_LOAD);
});

function listFilesRecursively(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else results.push(full.slice(root.length + 1));
    }
  };
  walk(root);
  return results;
}

function envelopeRecord<T>(path: string): T {
  return (JSON.parse(readFileSync(path, 'utf8')) as { record: T }).record;
}

// ---------------------------------------------------------------------------
// 1. Defect 1: the canonical absolute child freeze path.
// ---------------------------------------------------------------------------

describe('2D2C-F0X defect 1: resolveChildFreezePath', () => {
  it.each([
    { slot: PAIR_1_V4, relative: F0I_FREEZE_PATH, hash: PROPOSED_F0I_FREEZE_RAW_SHA256 },
    { slot: PAIR_1_V5, relative: F0O_FREEZE_PATH, hash: PROPOSED_F0O_FREEZE_RAW_SHA256 },
  ])(
    'ROOT CAUSE: the $slot.slotId template still names the RELATIVE frozen path (identity unchanged); the resolver returns the absolute, hash-verified path under the runner repo',
    ({ slot, relative, hash }) => {
      const template = buildSlotExecutionPlanTemplate(slot, F0I_PLAN, F0O_PLAN);
      expect(template.freezePath).toBe(relative);
      expect(isAbsolute(template.freezePath)).toBe(false);

      const absolute = resolveChildFreezePath({
        runnerRepoRoot: ROOT,
        template,
        readFile,
        sha256: sha256Hex,
      });
      expect(isAbsolute(absolute)).toBe(true);
      expect(absolute).toBe(join(ROOT, relative));
      expect(sha256Hex(readFileSync(absolute))).toBe(hash);
    },
  );

  const template = (): SlotExecutionPlanTemplate =>
    buildSlotExecutionPlanTemplate(PAIR_1_V4, F0I_PLAN, F0O_PLAN);
  const refusalOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (error) {
      if (error instanceof ChildFreezePathError) return error.refusal;
      throw error;
    }
    throw new Error('expected a ChildFreezePathError');
  };

  it('refuses a relative runner repository root', () => {
    expect(
      refusalOf(() =>
        resolveChildFreezePath({
          runnerRepoRoot: '.',
          template: template(),
          readFile,
          sha256: sha256Hex,
        }),
      ),
    ).toBe('RUNNER_REPO_ROOT_NOT_ABSOLUTE');
  });

  it('refuses a template naming anything but its variant’s frozen relative path — including an already-absolute or cross-variant one', () => {
    for (const freezePath of [join(ROOT, F0I_FREEZE_PATH), F0O_FREEZE_PATH, '../x.json']) {
      expect(
        refusalOf(() =>
          resolveChildFreezePath({
            runnerRepoRoot: ROOT,
            template: { ...template(), freezePath },
            readFile,
            sha256: sha256Hex,
          }),
        ),
      ).toBe('NOT_THE_FROZEN_HISTORICAL_FREEZE_PATH');
    }
  });

  it('refuses a runner root under which the freeze is unreadable (the scratch-cwd case)', () => {
    expect(
      refusalOf(() =>
        resolveChildFreezePath({
          runnerRepoRoot: tmpdir(),
          template: template(),
          readFile,
          sha256: sha256Hex,
        }),
      ),
    ).toBe('FREEZE_UNREADABLE_AT_ABSOLUTE_PATH');
  });

  it('refuses bytes that do not hash to the frozen F0I/F0O identity', () => {
    expect(
      refusalOf(() =>
        resolveChildFreezePath({
          runnerRepoRoot: ROOT,
          template: template(),
          readFile: () => Buffer.from('not the frozen bytes'),
          sha256: sha256Hex,
        }),
      ),
    ).toBe('FREEZE_HASH_MISMATCH_AT_ABSOLUTE_PATH');
  });
});

// ---------------------------------------------------------------------------
// 2. + 3. PHYSICAL: the real Tier-2 harness, real fork, real scratch cwd.
// ---------------------------------------------------------------------------

/** A StudyExecutorInput carrying only what `buildSlotExperimentInput` reads. */
function executorInputFor(
  launcher: ChildLauncher,
  variantRoots: { readonly v4Root: string; readonly v5Root: string },
): StudyExecutorInput {
  const unused = (): never => {
    throw new Error('not reached by buildSlotExperimentInput');
  };
  return {
    registry,
    f0iPlan: F0I_PLAN,
    f0oPlan: F0O_PLAN,
    executionIntegrationCommit: 'a'.repeat(40),
    candidatePathForSlot: unused,
    studyApprovalPath: null,
    readFile,
    sha256: sha256Hex,
    currentHead: unused,
    alreadyConsumed: unused,
    sequencingProbes: { isDirectory: unused, listFilesRecursively: unused, readFile },
    outputRootProbes: { realpath: unused, isDirectory: unused },
    forbiddenOutputRootContainers: [],
    runnerRepoRoot: ROOT,
    v4Root: variantRoots.v4Root,
    v5Root: variantRoots.v5Root,
    classifierConfigDir: join(tmpdir(), 'nwf-pe-f0x-no-profile'),
    parentEnv: {
      PATH: process.env['PATH'] ?? '',
      HOME: process.env['HOME'] ?? '',
      TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
    },
    platform: 'posix',
    launcher,
    clock: { nowUtc: () => new Date('2026-09-16T12:00:00.000Z') },
  };
}

function realTier2Launcher(
  modulePath: string,
  spawned: { pid: number; scratchDir: string }[],
): ChildLauncher {
  return {
    launch: (input) =>
      runProcessIsolatedBatch({
        modulePath,
        args: ['--manifest', input.manifestPath],
        watchdogMs: 60_000,
        graceMs: 1_000,
        childEnv: input.childEnv,
        onChildSpawned: (pid, scratchDir) => spawned.push({ pid, scratchDir }),
      }),
  };
}

/** Runs ONE logical evaluation for `slot` through the executor's own ExperimentInput construction. */
async function runOneEvaluation(
  slot: StudySlotIdentity,
  modulePath: string,
  variantRoots: { readonly v4Root: string; readonly v5Root: string },
  freezePathOverride?: (template: SlotExecutionPlanTemplate) => string,
) {
  const spawned: { pid: number; scratchDir: string }[] = [];
  const executorInput = executorInputFor(realTier2Launcher(modulePath, spawned), variantRoots);
  const full = buildSlotExecutionPlanTemplate(slot, F0I_PLAN, F0O_PLAN);
  const truncated = <
    T extends { evaluations: readonly unknown[]; plannedLogicalEvaluations: number },
  >(
    plan: T,
  ): T => ({ ...plan, evaluations: [plan.evaluations[0]], plannedLogicalEvaluations: 1 });
  const template: SlotExecutionPlanTemplate = { ...full, plan: truncated(full.plan) };
  mkdirSync(template.outputRoot, { recursive: true });
  const childFreezePath =
    freezePathOverride?.(template) ??
    resolveChildFreezePath({ runnerRepoRoot: ROOT, template, readFile, sha256: sha256Hex });
  const authorisationSha256 = sha256Hex(`f0x-zero-inference-recovery-${slot.slotId}-${Date.now()}`);
  const experiment = await runExperiment(
    buildSlotExperimentInput(
      executorInput,
      template,
      childFreezePath,
      { slotId: slot.slotId } as unknown as F0WSlotExecutionAuthorisation,
      authorisationSha256,
    ),
  );
  const attemptDir = attemptDirectoryOf(
    template.outputRoot,
    slot.variantName,
    1,
    template.attemptNo,
  );
  return { experiment, spawned, attemptDir, template };
}

interface PreflightRecord {
  readonly ok: boolean;
  readonly stopCondition: string | null;
  readonly detail: string;
  readonly checks: { readonly stage?: string };
  readonly providerConstructed: boolean;
}

describe.skipIf(IS_WINDOWS)(
  '2D2C-F0X defect 1 PHYSICAL: the real child entry, real Tier-2 scratch cwd, for BOTH V4 and V5',
  () => {
    it.each([
      {
        slot: PAIR_1_V4,
        relative: F0I_FREEZE_PATH,
        preservedPreflightFileSha256:
          'd941b842073c47b7d1723a3a0176cc87c30f1a654206c0a6d6a78bc7ef41816e',
        preservedPreflightRecordSha256:
          '547e3bd57e313c10eb30d7f1e7e03ba70d6abcc6f70ed0ad519eaebfa44d3f0c',
      },
      {
        slot: PAIR_1_V5,
        relative: F0O_FREEZE_PATH,
        preservedPreflightFileSha256:
          '4b344e889e029ef488aec9ac5ee95ea7487b102198c76bab3fa072e11bf87a85',
        preservedPreflightRecordSha256:
          'd86be5c0b305f2cf4fd0c7b44b4d47150a5c341f64f97d8dba1bf1a6606523d4',
      },
    ])(
      '$slot.slotId: NEGATIVE CONTROL — the pre-fix RELATIVE path reproduces the preserved ENOENT child preflight byte-for-byte; the FIXED absolute path loads the freeze and stops only at variantRoot, zero provider',
      async ({ slot, relative, preservedPreflightFileSha256, preservedPreflightRecordSha256 }) => {
        const nonFrozenRoots = { v4Root: ROOT, v5Root: ROOT };

        // Pre-fix: exactly what the failed study handed the child.
        const before = await runOneEvaluation(
          slot,
          CHILD_ENTRY_PATH,
          nonFrozenRoots,
          (template) => template.freezePath,
        );
        expect(before.spawned).toHaveLength(1);
        expect(before.spawned[0]!.scratchDir.startsWith(ROOT)).toBe(false);
        const beforePreflightPath = join(before.attemptDir, 'child-preflight.json');
        const beforePreflight = envelopeRecord<PreflightRecord>(beforePreflightPath);
        expect(beforePreflight).toEqual({
          ok: false,
          stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
          detail: `Error: ENOENT: no such file or directory, open '${relative}'`,
          checks: { stage: 'freeze' },
          providerConstructed: false,
        });
        expect(sha256Hex(readFileSync(beforePreflightPath))).toBe(preservedPreflightFileSha256);
        expect(
          (JSON.parse(readFileSync(beforePreflightPath, 'utf8')) as { recordSha256: string })
            .recordSha256,
        ).toBe(preservedPreflightRecordSha256);
        rmSync(before.template.outputRoot, { recursive: true, force: true });

        // Fixed: the executor's canonical absolute path.
        const after = await runOneEvaluation(slot, CHILD_ENTRY_PATH, nonFrozenRoots);
        expect(after.spawned).toHaveLength(1);
        expect(after.spawned[0]!.scratchDir.startsWith(ROOT)).toBe(false);
        const manifest = envelopeRecord<{ freezePath: string }>(
          join(after.attemptDir, 'child-manifest.json'),
        );
        expect(manifest.freezePath).toBe(join(ROOT, relative));
        const afterPreflight = envelopeRecord<PreflightRecord>(
          join(after.attemptDir, 'child-preflight.json'),
        );
        expect(afterPreflight.ok).toBe(false);
        expect(afterPreflight.providerConstructed).toBe(false);
        // Past `freeze`: the forked child opened the absolute path from its
        // scratch cwd and resolved the right family by hash; it stops only
        // because this worktree is not the frozen variant runtime root.
        expect(afterPreflight.checks.stage).toBe('variantRoot');
        for (const file of listFilesRecursively(after.template.outputRoot)) {
          expect(file.endsWith('provider-outcome.json')).toBe(false);
          expect(file.endsWith('raw-output-checkpoint.json')).toBe(false);
        }
      },
      120_000,
    );
  },
);

describe.skipIf(!REAL_RUNTIME_ROOTS_AVAILABLE)(
  '2D2C-F0X defect 1 PHYSICAL: BOTH V4 and V5 pass the FULL child preflight and reach the provider-construction boundary through a no-provider seam (real frozen runtime roots; machine-local)',
  () => {
    it.each([{ slot: PAIR_1_V4 }, { slot: PAIR_1_V5 }])(
      '$slot.slotId: freeze + variant root + DEVELOPMENT corpus + batch + identity all verify in the forked child; the seam is reached; providerConstructed stays false; the corrected classifier reads the root as AMBIGUOUS, never Class C',
      async ({ slot }) => {
        const run = await runOneEvaluation(slot, NO_PROVIDER_CHILD_ENTRY, {
          v4Root: REAL_V4_RUNTIME_ROOT,
          v5Root: REAL_V5_RUNTIME_ROOT,
        });
        expect(run.spawned).toHaveLength(1);
        expect(run.spawned[0]!.scratchDir.startsWith(ROOT)).toBe(false);
        expect(
          envelopeRecord<{ freezePath: string }>(join(run.attemptDir, 'child-manifest.json'))
            .freezePath,
        ).toBe(
          join(
            ROOT,
            slot.variantName === 'PROMPT_V4_CANONICAL' ? F0I_FREEZE_PATH : F0O_FREEZE_PATH,
          ),
        );

        const preflight = envelopeRecord<PreflightRecord>(
          join(run.attemptDir, 'child-preflight.json'),
        );
        expect(preflight.ok).toBe(true);
        expect(preflight.providerConstructed).toBe(false);
        const failure = envelopeRecord<{ thrown: boolean; message: string }>(
          join(run.attemptDir, 'child-failure.json'),
        );
        expect(failure.thrown).toBe(true);
        expect(failure.message).toContain(NO_PROVIDER_SEAM_SENTINEL);

        const files = listFilesRecursively(run.template.outputRoot);
        for (const marker of [
          'provider-outcome.json',
          'raw-output-checkpoint.json',
          'validation-result.json',
          'tier1-diagnostics.json',
          'child-result.json',
        ]) {
          expect(files.some((file) => file.endsWith(marker))).toBe(false);
        }

        const classification = classifySlotEvidence(run.template.outputRoot, {
          isDirectory: (path) => existsSync(path),
          listFilesRecursively,
          readFile,
        });
        expect(inclusionClassOf(classification)).toBe('AMBIGUOUS_EVIDENCE');
      },
      180_000,
    );
  },
);

// ---------------------------------------------------------------------------
// 4. Defect 2: the corrected classification, pure, synthetic probes.
// ---------------------------------------------------------------------------

const STUDY = '/preserved-shape-study';
const rootOf = (slot: StudySlotIdentity): string => `${STUDY}/${slot.futureOutputRootName}`;

/** The exact file set every preserved failed slot holds (10 files). */
function preservedFailedSlotFiles(slot: StudySlotIdentity, markerSha256: string): string[] {
  const attempt = slot.variantName === 'PROMPT_V4_CANONICAL' ? 3 : 4;
  const dir = `evaluations/${slot.variantName}/batch-01/attempt-${attempt}`;
  return [
    `authorisations/${markerSha256}.json`,
    `${dir}/child-manifest.json`,
    `${dir}/child-preflight.json`,
    `${dir}/final-record.json`,
    `${dir}/planned-input.json`,
    `${dir}/stop-decision.json`,
    `${dir}/tier2-outcome.json`,
    `experiments/attempt-${attempt}/experiment-manifest.json`,
    `experiments/attempt-${attempt}/experiment-stop.json`,
    'study-slot-identity.json',
  ];
}

/** The preserved refusal record, verbatim. */
function preservedPreflightBytes(slot: StudySlotIdentity, overrides: object = {}): Buffer {
  const relative = slot.variantName === 'PROMPT_V4_CANONICAL' ? F0I_FREEZE_PATH : F0O_FREEZE_PATH;
  return Buffer.from(
    serializeEnvelope(
      envelopeOf('CHILD_PREFLIGHT', {
        ok: false,
        stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
        detail: `Error: ENOENT: no such file or directory, open '${relative}'`,
        checks: { stage: 'freeze' },
        providerConstructed: false,
        ...overrides,
      }),
    ),
  );
}

function preflightPathOf(slot: StudySlotIdentity): string {
  const attempt = slot.variantName === 'PROMPT_V4_CANONICAL' ? 3 : 4;
  return `${rootOf(slot)}/evaluations/${slot.variantName}/batch-01/attempt-${attempt}/child-preflight.json`;
}

interface RecordingProbes extends SlotEvidenceProbes {
  readonly reads: string[];
}

function probesFor(
  filesByRoot: Record<string, readonly string[]>,
  bytesByPath: Record<string, Buffer>,
): RecordingProbes {
  const reads: string[] = [];
  return {
    reads,
    isDirectory: (path) => filesByRoot[path] !== undefined,
    listFilesRecursively: (path) => filesByRoot[path] ?? [],
    readFile: (path) => {
      reads.push(path);
      const bytes = bytesByPath[path];
      if (bytes === undefined) throw new Error(`ENOENT: ${path}`);
      return bytes;
    },
  };
}

/** All ten slots in the exact preserved failed shape. */
function preservedFailedStudy(): RecordingProbes {
  const files: Record<string, readonly string[]> = {};
  const bytes: Record<string, Buffer> = {};
  for (const slot of F0V_SLOTS) {
    files[rootOf(slot)] = preservedFailedSlotFiles(slot, sha256Hex(slot.slotId));
    bytes[preflightPathOf(slot)] = preservedPreflightBytes(slot);
  }
  return probesFor(files, bytes);
}

describe('2D2C-F0X defect 2: the preserved real failure shape is Class B, read without gold', () => {
  it('the synthetic preflight bytes ARE the preserved bytes (V4 and V5 file hashes match the preserved study)', () => {
    expect(sha256Hex(preservedPreflightBytes(PAIR_1_V4))).toBe(
      'd941b842073c47b7d1723a3a0176cc87c30f1a654206c0a6d6a78bc7ef41816e',
    );
    expect(sha256Hex(preservedPreflightBytes(PAIR_1_V5))).toBe(
      '4b344e889e029ef488aec9ac5ee95ea7487b102198c76bab3fa072e11bf87a85',
    );
  });

  it.each(F0V_SLOTS.map((slot) => ({ slot })))(
    '$slot.slotId: consumed + providerConstructed:false + no provider outcome => CLASS_B, durably closed, reading ONLY its child preflight',
    ({ slot }) => {
      const probes = preservedFailedStudy();
      const classification = classifySlotEvidence(rootOf(slot), probes);
      expect(classification.disposition).toBe('PRE_INFERENCE_REFUSAL');
      expect(inclusionClassOf(classification)).toBe(
        'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
      );
      expect(classification.durablyClosed).toBe(true);
      expect(probes.reads).toEqual([preflightPathOf(slot)]);
      for (const path of probes.reads) {
        expect(path).not.toMatch(
          /gold|holdout|acceptance|adjudication|corpus|manifest|final-record/i,
        );
      }
    },
  );

  it('Class B on slot 1 prevents slot 2 — and every later slot — from starting', () => {
    const probes = preservedFailedStudy();
    for (const target of F0V_SLOTS.slice(1)) {
      const decision = evaluateSequencingGate(target.slotId, rootOf, probes);
      expect(decision).toMatchObject({
        eligible: false,
        refusal: 'PRIOR_SLOT_PAUSED_CLASS_B',
        blockingSlot: PAIR_1_V4,
      });
    }
    expect(evaluateSequencingGate(PAIR_1_V4.slotId, rootOf, probes)).toMatchObject({
      eligible: false,
      refusal: 'TARGET_SLOT_ALREADY_HAS_EVIDENCE',
    });
  });
});

describe('2D2C-F0X defect 2: a real semantic-execution marker is Class C, and must be durably closed', () => {
  const attemptDir = 'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3';
  it.each([
    `${attemptDir}/provider-outcome.json`,
    `${attemptDir}/raw-output-checkpoint.json`,
    `${attemptDir}/validation-result.json`,
    `${attemptDir}/tier1-diagnostics.json`,
    `${attemptDir}/child-result.json`,
    `${attemptDir}/repair-1/repair-round.json`,
    `${attemptDir}/repair-1/doc-003/repair-provider-outcome.json`,
    `${attemptDir}/repair-1/doc-003/repair-raw-output-checkpoint.json`,
  ])('%s => CLASS_C (no preflight content needed)', (marker) => {
    const files = [...preservedFailedSlotFiles(PAIR_1_V4, 'a'.repeat(64)), marker];
    const probes = probesFor({ [rootOf(PAIR_1_V4)]: files }, {});
    const classification = classifySlotEvidence(rootOf(PAIR_1_V4), probes);
    expect(inclusionClassOf(classification)).toBe(
      'CLASS_C_PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED',
    );
    expect(probes.reads).toEqual([]);
    // Durably closed (experiment-stop present) => slot 2 may start.
    expect(evaluateSequencingGate(PAIR_1_V5.slotId, rootOf, probes)).toMatchObject({
      eligible: true,
    });
  });

  it('Class C WITHOUT a terminal experiment record blocks the next slot', () => {
    const files = preservedFailedSlotFiles(PAIR_1_V4, 'a'.repeat(64))
      .filter((file) => !file.endsWith('experiment-stop.json'))
      .concat(`${attemptDir}/provider-outcome.json`);
    const probes = probesFor({ [rootOf(PAIR_1_V4)]: files }, {});
    expect(evaluateSequencingGate(PAIR_1_V5.slotId, rootOf, probes)).toMatchObject({
      eligible: false,
      refusal: 'PRIOR_SLOT_CLASS_C_NOT_YET_DURABLY_CLOSED',
    });
  });
});

describe('2D2C-F0X defect 2: genuinely ambiguous evidence still fails closed', () => {
  const dir = 'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3';
  const base = (): string[] => preservedFailedSlotFiles(PAIR_1_V4, 'a'.repeat(64));
  const path = preflightPathOf(PAIR_1_V4);
  const cases: {
    name: string;
    files: string[];
    bytes: Record<string, Buffer>;
  }[] = [
    {
      name: 'preflight ok:true with no marker (provider factory reachable, request unprovable)',
      files: base(),
      bytes: {
        [path]: Buffer.from(
          serializeEnvelope(
            envelopeOf('CHILD_PREFLIGHT', {
              ok: true,
              stopCondition: null,
              detail: 'passed',
              checks: [],
              providerConstructed: false,
            }),
          ),
        ),
      },
    },
    {
      name: 'providerConstructed not false',
      files: base(),
      bytes: { [path]: preservedPreflightBytes(PAIR_1_V4, { providerConstructed: true }) },
    },
    {
      name: 'a preflight that fails its own recorded hash',
      files: base(),
      bytes: {
        [path]: Buffer.from(
          preservedPreflightBytes(PAIR_1_V4).toString('utf8').replace('"freeze"', '"variantRoot"'),
        ),
      },
    },
    {
      name: 'an unreadable preflight',
      files: base(),
      bytes: {},
    },
    {
      name: 'a child manifest with no child preflight',
      files: base().filter((file) => !file.endsWith('child-preflight.json')),
      bytes: {},
    },
    {
      name: 'a child preflight with no child manifest',
      files: base().filter((file) => !file.endsWith('child-manifest.json')),
      bytes: { [path]: preservedPreflightBytes(PAIR_1_V4) },
    },
    {
      name: 'a child-failure record',
      files: [...base(), `${dir}/child-failure.json`],
      bytes: { [path]: preservedPreflightBytes(PAIR_1_V4) },
    },
    {
      name: 'an unexplained file',
      files: [...base(), 'notes.txt'],
      bytes: { [path]: preservedPreflightBytes(PAIR_1_V4) },
    },
  ];
  it.each(cases)('$name => AMBIGUOUS, and slot 2 is refused', ({ files, bytes }) => {
    const probes = probesFor({ [rootOf(PAIR_1_V4)]: files }, bytes);
    expect(inclusionClassOf(classifySlotEvidence(rootOf(PAIR_1_V4), probes))).toBe(
      'AMBIGUOUS_EVIDENCE',
    );
    expect(evaluateSequencingGate(PAIR_1_V5.slotId, rootOf, probes)).toMatchObject({
      eligible: false,
      refusal: 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE',
    });
  });
});

// ---------------------------------------------------------------------------
// 5. The request-free inventory of the preserved failed study.
// ---------------------------------------------------------------------------

describe('2D2C-F0X: the request-free failed-study inventory', () => {
  it('over the exact preserved ten-slot shape: 10 preflights with providerConstructed:false, 0 semantic markers, 0 provider requests, 0 adapter attempts, 10 x Class B', () => {
    const base = preservedFailedStudy();
    const files: Record<string, readonly string[]> = { [STUDY]: [] };
    for (const slot of F0V_SLOTS) {
      const slotFiles = base.listFilesRecursively(rootOf(slot));
      files[rootOf(slot)] = slotFiles;
      files[STUDY] = [
        ...files[STUDY]!,
        ...slotFiles.map((f) => `${slot.futureOutputRootName}/${f}`),
      ];
    }
    const probes: SlotEvidenceProbes = {
      isDirectory: (path) => files[path] !== undefined,
      listFilesRecursively: (path) => files[path] ?? [],
      readFile: (path) => {
        try {
          return base.readFile(path);
        } catch {
          return Buffer.from('{}');
        }
      },
    };
    const inventory = buildFailedStudyInventory(STUDY, probes);
    expect(inventory.slots).toHaveLength(10);
    expect(inventory.totals).toEqual({
      slotsPresent: 10,
      childPreflights: 10,
      childPreflightsWithProviderConstructedFalse: 10,
      semanticExecutionMarkers: 0,
      providerRequestsObserved: 0,
      adapterAttemptsObserved: 0,
      classA: 0,
      classB: 10,
      classC: 0,
      ambiguous: 0,
    });
    for (const slot of inventory.slots) {
      expect(slot.childPreflights[0]).toMatchObject({
        recordSha256Verified: true,
        ok: false,
        providerConstructed: false,
        stage: 'freeze',
      });
    }
  });

  it.runIf(existsSync(REAL_F0V_STUDY_ROOT_STRING))(
    'TRIPWIRE (machine-local): re-deriving the inventory from the REAL preserved study reproduces the committed inventory exactly — the evidence is unchanged',
    () => {
      const committed: unknown = JSON.parse(
        readFileSync(
          join(ROOT, 'docs/evaluation/PHASE_2B_2D2C_F0X_FAILED_STUDY_INVENTORY_V1.json'),
          'utf8',
        ),
      );
      const rederived = buildFailedStudyInventory(
        REAL_F0V_STUDY_ROOT_STRING,
        createReadOnlyInventoryProbes(),
        `${REAL_F0V_STUDY_ROOT_STRING}-control`,
      );
      expect(JSON.parse(JSON.stringify(rederived))).toEqual(committed);
      expect(rederived.totals).toMatchObject({
        slotsPresent: 10,
        childPreflightsWithProviderConstructedFalse: 10,
        semanticExecutionMarkers: 0,
        providerRequestsObserved: 0,
        adapterAttemptsObserved: 0,
        classB: 10,
        classC: 0,
      });
      expect((rederived.studyTerminal?.record as { outcome: string } | undefined)?.outcome).toBe(
        'COMPLETED_ALL_SLOTS',
      );
    },
  );
});

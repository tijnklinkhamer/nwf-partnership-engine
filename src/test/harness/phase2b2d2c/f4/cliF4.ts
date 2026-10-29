/**
 * PHASE 2B-2D2C-F4 — THE ONE FINAL-V6 STUDY ENTRY POINT.
 *
 * DEFAULT = PREFLIGHT ONLY. With no `--execute`, this CLI runs the executor's
 * pre-start stages alone (`runF4PreStartChecks`): it verifies the approved
 * study, the exact clean HEAD and F3's all-five preflight over the five F4
 * candidates — request-free, launcher-free, write-free — and reports what it
 * sees. It never calls the executor. `--study-approval`
 * may be given to preflight a real approval; without it the preflight refuses,
 * by design, for exactly that reason.
 *
 * `--execute` runs the WHOLE study, all five slots in frozen order, through
 * `runF4V6StudyExecution` — one invocation, one study approval, never five
 * manual slot commands. It requires, explicitly:
 *
 *   --study-approval <absolute path strictly inside the frozen control root>
 *   --v6-root <absolute path of the clean V6 runtime worktree>
 *   --classifier-config-dir <absolute path of the owner's approved profile>
 *
 * The candidates are found by ONE deterministic lookup
 * (`<control root>/execution-candidates-f4/<slotId>.json`); the study root,
 * the slot output roots, the slot order and the plan are frozen. There is NO
 * start-slot, only-slot, skip-slot, slot-order, variant, prompt, freeze,
 * study-root, output-root or candidate-directory override, and an unknown
 * flag is an error. Before any child is forked the executor verifies the
 * approved bytes, the exact clean HEAD, the all-five preflight (candidate
 * hash and bytes, study approval, output roots, "before slot 1") — and each
 * slot's composed decision again, live.
 *
 * The CLI reads no credential and sets none: the parent environment passes
 * through the coordinator's allowlisted child-environment builder, and the
 * approved auth-status check stays inside the production provider the child
 * constructs after its own preflight.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f4/cliF4.ts [--json]
 *     [--study-approval <path>]
 *     [--execute --study-approval <path> --v6-root <path> --classifier-config-dir <path>]
 */
import { readFileSync } from 'node:fs';
import { isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { terminationPlatformOf } from '../../processIsolatedBatch.js';
import type { ChildLauncher } from '../coordinator.js';
import { F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import { isStrictlyInside } from '../f0x/recovery1Overlay.js';
import {
  createF0XProductionLauncher,
  gitCommand,
  isF0XSlotAuthorisationConsumed,
  listWorktrees,
  outputRootProbes,
  RUNNER_REPO_ROOT,
  sequencingProbes,
  sha256Hex,
} from '../f0x/cliF0X.js';
import { F2_CONTROL_ROOT } from '../f2/freezeF2.js';
import { f4CandidatePathForSlot } from './candidateInventoryF4.js';
import { runF4PreStartChecks, runF4V6StudyExecution } from './studyExecutorF4.js';

export interface F4CliOptions {
  readonly json: boolean;
  readonly execute: boolean;
  readonly studyApprovalPath: string | null;
  readonly v6Root: string | null;
  readonly classifierConfigDir: string | null;
}

const FLAGS_WITH_VALUE = new Set(['--study-approval', '--v6-root', '--classifier-config-dir']);

/** Closed parser: an unknown flag is an error, never ignored, and no flag names a slot, root or order. */
export function parseF4CliArgs(argv: readonly string[]): F4CliOptions {
  const options = {
    json: false,
    execute: false,
    studyApprovalPath: null as string | null,
    v6Root: null as string | null,
    classifierConfigDir: null as string | null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--json') options.json = true;
    else if (arg === '--execute') options.execute = true;
    else if (FLAGS_WITH_VALUE.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${arg} requires a value.`);
      i += 1;
      if (arg === '--study-approval') options.studyApprovalPath = value;
      else if (arg === '--v6-root') options.v6Root = value;
      else options.classifierConfigDir = value;
    } else throw new Error(`unknown argument ${JSON.stringify(arg)}.`);
  }
  return options;
}

export interface F4CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nowUtc: () => Date;
  readonly launcher: ChildLauncher;
}

/** Output roots may never lie inside the repository, a worktree, the control root or a historical study root. */
export function f4ForbiddenOutputRootContainers(repoRoot: string): readonly string[] {
  return [
    ...new Set([
      repoRoot,
      ...listWorktrees(repoRoot),
      F2_CONTROL_ROOT,
      F0V_STUDY_ROOT,
      `${F0V_STUDY_ROOT}-control`,
    ]),
  ];
}

function isAbsoluteNormalised(path: string): boolean {
  return isAbsolute(path) && normalize(path) === path;
}

export async function runF4Cli(argv: readonly string[], io: F4CliIo): Promise<number> {
  let options: F4CliOptions;
  try {
    options = parseF4CliArgs(argv);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (
    options.studyApprovalPath !== null &&
    (!isAbsoluteNormalised(options.studyApprovalPath) ||
      !isStrictlyInside(options.studyApprovalPath, F2_CONTROL_ROOT))
  ) {
    io.stderr(
      `REFUSED: --study-approval must be an absolute path strictly inside the frozen control root ${F2_CONTROL_ROOT}.\n`,
    );
    return 2;
  }

  if (options.execute) {
    const missing: string[] = [];
    if (options.studyApprovalPath === null) missing.push('--study-approval');
    if (options.v6Root === null) missing.push('--v6-root');
    if (options.classifierConfigDir === null) missing.push('--classifier-config-dir');
    if (missing.length > 0) {
      io.stderr(`REFUSED: --execute requires ${missing.join(', ')}.\n`);
      return 2;
    }
    for (const [flag, path] of [
      ['--v6-root', options.v6Root!],
      ['--classifier-config-dir', options.classifierConfigDir!],
    ] as const) {
      if (!isAbsoluteNormalised(path)) {
        io.stderr(`REFUSED: ${flag} must be an absolute, normalised path.\n`);
        return 2;
      }
    }
  }

  const currentHead = (): string => gitCommand(RUNNER_REPO_ROOT, ['rev-parse', 'HEAD']);
  const workingTreeClean = (): boolean =>
    gitCommand(RUNNER_REPO_ROOT, ['status', '--porcelain']) === '';

  const outcome = options.execute
    ? await runF4V6StudyExecution({
        runnerRepoRoot: RUNNER_REPO_ROOT,
        candidatePathForSlot: f4CandidatePathForSlot,
        studyApprovalPath: options.studyApprovalPath,
        readFile: (path) => readFileSync(path),
        sha256: sha256Hex,
        currentHead,
        workingTreeClean,
        alreadyConsumed: isF0XSlotAuthorisationConsumed,
        sequencingProbes: sequencingProbes(),
        outputRootProbes: outputRootProbes(),
        forbiddenOutputRootContainers: f4ForbiddenOutputRootContainers(RUNNER_REPO_ROOT),
        v6Root: options.v6Root!,
        classifierConfigDir: options.classifierConfigDir!,
        parentEnv: io.env,
        platform: terminationPlatformOf(process.platform),
        launcher: io.launcher,
        clock: { nowUtc: io.nowUtc },
      })
    : // PREFLIGHT ONLY: stages 1–3 alone. No launcher, no write, no consumption.
      runF4PreStartChecks({
        runnerRepoRoot: RUNNER_REPO_ROOT,
        candidatePathForSlot: f4CandidatePathForSlot,
        studyApprovalPath: options.studyApprovalPath,
        readFile: (path) => readFileSync(path),
        sha256: sha256Hex,
        currentHead,
        workingTreeClean,
        alreadyConsumed: isF0XSlotAuthorisationConsumed,
        sequencingProbes: sequencingProbes(),
        outputRootProbes: outputRootProbes(),
        forbiddenOutputRootContainers: f4ForbiddenOutputRootContainers(RUNNER_REPO_ROOT),
        nowUtc: io.nowUtc,
      });

  const summary = {
    mode: options.execute ? 'EXECUTE_STUDY' : 'PREFLIGHT_ONLY',
    outcome:
      outcome.status === 'READY'
        ? {
            status: 'READY',
            executed: false,
            executionBuild: outcome.head,
            preflight: outcome.preflight,
          }
        : outcome,
  };
  io.stdout(
    options.json ? `${JSON.stringify(summary, null, 2)}\n` : `${summary.mode}: ${outcome.status}\n`,
  );
  if (outcome.status === 'COMPLETED_ALL_SLOTS' || outcome.status === 'READY') return 0;
  return outcome.status === 'PAUSED' ? 3 : 1;
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runF4Cli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: process.env,
    nowUtc: () => new Date(),
    launcher: createF0XProductionLauncher(),
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    });
}

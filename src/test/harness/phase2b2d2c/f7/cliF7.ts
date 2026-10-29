/**
 * PHASE 2B-2D2C-F7 — THE ONE F6 RESTART STUDY ENTRY POINT.
 *
 * DEFAULT = REQUEST-FREE PREVIEW. With no `--execute`, this CLI observes the
 * host and evaluates the host-awake gate, then runs the executor's write-free
 * pre-start stages (`runF7PreStartChecks`: F6 study context, exact clean HEAD,
 * all-five preflight over the five F7 candidates) and reports both. It never
 * calls the executor, launches nothing, writes nothing and consumes nothing.
 *
 * `--execute` runs the WHOLE study, all five slots in frozen order, through
 * `runF7RestartStudyExecution`, whose FIRST stage is the host-awake gate. It
 * requires, explicitly:
 *
 *   --study-approval <absolute path strictly inside the F6 control root>
 *   --v6-root <absolute path of the clean V6 runtime worktree>
 *   --classifier-config-dir <absolute path of the owner's approved profile>
 *   --operator-precondition LID_OPEN_REQUIRED
 *
 * and must itself run wrapped as
 *
 *   /usr/bin/caffeinate -dimsu -- node --import tsx src/test/harness/phase2b2d2c/f7/cliF7.ts --execute ...
 *
 * because the gate refuses unless a caffeinate idle-sleep assertion covers
 * this process or an ancestor. `caffeinate` does not make closing the lid
 * safe; the lid stays open until the study writes its terminal record.
 *
 * There is NO start-slot, only-slot, skip-slot, slot-order, variant, prompt,
 * freeze, study-root, output-root or candidate-directory override, and an
 * unknown flag is an error. The CLI reads no credential and sets none.
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
import { F5_CONTROL_ROOT, F5_STUDY_ROOT } from '../f6/f5ClosureF6.js';
import type { HostAwakeObservations } from '../f6/hostAwakePreflightF6.js';
import { f7CandidatePathForSlot } from './candidateInventoryF7.js';
import { evaluateF7HostAwakeGate } from './hostAwakeGateF7.js';
import { observeHostForF7 } from './hostObservationF7.js';
import { runF7PreStartChecks, runF7RestartStudyExecution } from './studyExecutorF7.js';
import { F7_CONTROL_ROOT } from './studyRootsF7.js';

export interface F7CliOptions {
  readonly json: boolean;
  readonly execute: boolean;
  readonly studyApprovalPath: string | null;
  readonly v6Root: string | null;
  readonly classifierConfigDir: string | null;
  readonly operatorPrecondition: string | null;
}

const FLAGS_WITH_VALUE = new Set([
  '--study-approval',
  '--v6-root',
  '--classifier-config-dir',
  '--operator-precondition',
]);

/** Closed parser: an unknown flag is an error, and no flag names a slot, root or order. */
export function parseF7CliArgs(argv: readonly string[]): F7CliOptions {
  const options = {
    json: false,
    execute: false,
    studyApprovalPath: null as string | null,
    v6Root: null as string | null,
    classifierConfigDir: null as string | null,
    operatorPrecondition: null as string | null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--json') options.json = true;
    else if (arg === '--execute') options.execute = true;
    else if (FLAGS_WITH_VALUE.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`${arg} requires a value.`);
      }
      i += 1;
      if (arg === '--study-approval') options.studyApprovalPath = value;
      else if (arg === '--v6-root') options.v6Root = value;
      else if (arg === '--classifier-config-dir') options.classifierConfigDir = value;
      else options.operatorPrecondition = value;
    } else throw new Error(`unknown argument ${JSON.stringify(arg)}.`);
  }
  return options;
}

export interface F7CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nowUtc: () => Date;
  readonly launcher: ChildLauncher;
  readonly observeHost: () => HostAwakeObservations;
}

/** Output roots may never lie inside the repository, a worktree, the F6 control root, an F5 root or a historical study root. */
export function f7ForbiddenOutputRootContainers(repoRoot: string): readonly string[] {
  return [
    ...new Set([
      repoRoot,
      ...listWorktrees(repoRoot),
      F7_CONTROL_ROOT,
      F5_STUDY_ROOT,
      F5_CONTROL_ROOT,
      F0V_STUDY_ROOT,
      `${F0V_STUDY_ROOT}-control`,
    ]),
  ];
}

function isAbsoluteNormalised(path: string): boolean {
  return isAbsolute(path) && normalize(path) === path;
}

export async function runF7Cli(argv: readonly string[], io: F7CliIo): Promise<number> {
  let options: F7CliOptions;
  try {
    options = parseF7CliArgs(argv);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  if (
    options.studyApprovalPath !== null &&
    (!isAbsoluteNormalised(options.studyApprovalPath) ||
      !isStrictlyInside(options.studyApprovalPath, F7_CONTROL_ROOT))
  ) {
    io.stderr(
      `REFUSED: --study-approval must be an absolute path strictly inside the F6 control root ${F7_CONTROL_ROOT}.\n`,
    );
    return 2;
  }

  if (options.execute) {
    const missing: string[] = [];
    if (options.studyApprovalPath === null) missing.push('--study-approval');
    if (options.v6Root === null) missing.push('--v6-root');
    if (options.classifierConfigDir === null) missing.push('--classifier-config-dir');
    if (options.operatorPrecondition === null) missing.push('--operator-precondition');
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
  const gates = {
    runnerRepoRoot: RUNNER_REPO_ROOT,
    candidatePathForSlot: f7CandidatePathForSlot,
    studyApprovalPath: options.studyApprovalPath,
    readFile: (path: string) => readFileSync(path),
    sha256: sha256Hex,
    currentHead,
    workingTreeClean,
    alreadyConsumed: isF0XSlotAuthorisationConsumed,
    sequencingProbes: sequencingProbes(),
    outputRootProbes: outputRootProbes(),
    forbiddenOutputRootContainers: f7ForbiddenOutputRootContainers(RUNNER_REPO_ROOT),
  };

  if (options.execute) {
    const outcome = await runF7RestartStudyExecution({
      ...gates,
      observeHost: io.observeHost,
      operatorLidOpenConfirmation: options.operatorPrecondition,
      v6Root: options.v6Root!,
      classifierConfigDir: options.classifierConfigDir!,
      parentEnv: io.env,
      platform: terminationPlatformOf(process.platform),
      launcher: io.launcher,
      clock: { nowUtc: io.nowUtc },
    });
    const summary = { mode: 'EXECUTE_STUDY', outcome };
    io.stdout(
      options.json
        ? `${JSON.stringify(summary, null, 2)}\n`
        : `${summary.mode}: ${outcome.status}\n`,
    );
    if (outcome.status === 'COMPLETED_ALL_SLOTS') return 0;
    return outcome.status === 'PAUSED' ? 3 : 1;
  }

  // PREVIEW ONLY: the host-awake gate and stages 1–3, reported together. No launcher, no write.
  const hostAwake = evaluateF7HostAwakeGate(io.observeHost(), options.operatorPrecondition);
  const preStart = runF7PreStartChecks({ ...gates, nowUtc: io.nowUtc });
  const summary = {
    mode: 'PREVIEW_ONLY',
    executed: false,
    hostAwake,
    outcome:
      preStart.status === 'READY'
        ? {
            status: 'READY',
            executionBuild: preStart.head,
            preflight: preStart.preflight,
          }
        : preStart,
  };
  io.stdout(
    options.json
      ? `${JSON.stringify(summary, null, 2)}\n`
      : `${summary.mode}: host-awake ${hostAwake.granted ? 'GRANTED' : 'REFUSED'}; ${preStart.status}\n`,
  );
  return preStart.status === 'READY' && hostAwake.granted ? 0 : 1;
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runF7Cli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: process.env,
    nowUtc: () => new Date(),
    launcher: createF0XProductionLauncher(),
    observeHost: observeHostForF7,
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
      process.exitCode = 1;
    });
}

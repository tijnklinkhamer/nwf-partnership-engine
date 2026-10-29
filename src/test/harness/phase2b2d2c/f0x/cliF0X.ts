/**
 * PHASE 2B-2D2C-F0X — THE STUDY EXECUTION-INTEGRATION CLI.
 *
 * DEFAULT = PREFLIGHT ONLY. With no `--execute-study`, this CLI runs
 * `runAllTenPreflight` alone — request-free, launcher-free — and reports
 * whether all ten candidates, the one study approval, and all ten output
 * roots would structurally accept a run. `--execute-study` additionally
 * requires `--candidate-set`, `--study-approval`, `--v4-root`, `--v5-root`
 * and `--classifier-config-dir`; anything less enables nothing.
 *
 * ONE study invocation processes all ten frozen slots automatically, in
 * their frozen order, through `runReplicationStudyExecution`. There is
 * deliberately NO `--skip-slot`, `--start-at`, `--only-slot`,
 * `--continue-from`, `--variant` override, slot-order override, or
 * output-root override — an operator names a candidate SET directory and
 * a study approval; which slot runs next, and against which output root,
 * is derived, never chosen per invocation. Recovery from a paused study is
 * a separately-reviewed path this CLI does not provide.
 *
 * RECOVERY-1 (`--recovery-1`, a boolean — never a path): the owner-approved
 * zero-inference recovery namespace. The study root, control directory,
 * failed-study identities and slot mapping are read ONLY from the pinned
 * overlay (`recovery1Overlay.ts`); `--candidate-set` and `--study-approval`
 * must lie inside the overlay's control directory; the lock, approval and
 * study-level preflight are the recovery-1 ones (`recovery1Authority.ts`,
 * `recovery1Preflight.ts`); and the failed study root, its control root and
 * the recovery control directory are forbidden output-root containers. The
 * failed study root and its control root are forbidden containers in every
 * mode.
 *
 * `--candidate-set <dir>` names a directory holding exactly the per-slot
 * candidate files, one per slot, named `<slotId>.json` (e.g.
 * `PAIR_1_V4.json`) — a deterministic manifest by construction: which file
 * authorises which slot is never operator-chosen at invocation time.
 *
 * Invoked directly via tsx, exactly like every other F0-series CLI (none
 * of them is wired into `package.json`):
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0x/cliF0X.ts [--json] [--recovery-1]
 *     [--execute-study --candidate-set <dir> --study-approval <path>
 *      --v4-root <path> --v5-root <path> --classifier-config-dir <path>]
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcessIsolatedBatch, terminationPlatformOf } from '../../processIsolatedBatch.js';
import type { OutputRootProbes } from '../artifacts.js';
import { isAuthorisationConsumed, type ChildLauncher } from '../coordinator.js';
import {
  buildF0IExecutionPlan,
  F0I_FREEZE_PATH,
  loadF0IFreezeFromBytes,
} from '../f0i/freezeF0I.js';
import {
  buildF0OExecutionPlan,
  F0O_FREEZE_PATH,
  loadF0OFreezeFromBytes,
} from '../f0o/freezeF0O.js';
import { F0V_FREEZE_PATH, F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import { type SlotEvidenceProbes } from '../f0w/sequencing.js';
import { loadStudySlotRegistry, type StudySlotRegistry } from '../f0w/slotRegistry.js';
import { runAllTenPreflight, type AllTenPreflightDecision } from './allTenPreflight.js';
import { createReadOnlyInventoryProbes } from './failedStudyInventory.js';
import { isConsumedByOuterSlotIdentity } from './outerSlotIdentity.js';
import { createRecovery1Authority } from './recovery1Authority.js';
import {
  F0X_RECOVERY_1_OVERLAY_PATH,
  isStrictlyInside,
  loadRecovery1OverlayFromBytes,
  type Recovery1Binding,
} from './recovery1Overlay.js';
import {
  evaluateRecovery1StudyPreflight,
  type Recovery1PreflightProbes,
} from './recovery1Preflight.js';
import { ORIGINAL_F0X_STUDY_AUTHORITY, type StudyAuthority } from './studyAuthority.js';
import { runReplicationStudyExecution, type StudyExecutionOutcome } from './studyExecutor.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** This worktree's root: the runner's own repository. */
export const RUNNER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');
/** The SAME Tier-2 child entry every prior attempt used; it resolves the freeze family by hash. */
export const CHILD_ENTRY_PATH = join(HERE, '..', 'childEntry.mjs');

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function gitCommand(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function listWorktrees(repoRoot: string): string[] {
  try {
    const text = execFileSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true,
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return text
      .split('\n')
      .filter((line) => line.startsWith('worktree '))
      .map((line) => line.slice('worktree '.length).trim());
  } catch {
    return [];
  }
}

/** Every FILE under `root`, as root-relative POSIX paths — the `SlotEvidenceProbes` contract. */
function listFilesRecursively(root: string): string[] {
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) results.push(relative(root, full).split(sep).join('/'));
    }
  };
  if (existsSync(root)) walk(root);
  return results;
}

export interface F0XCliOptions {
  readonly json: boolean;
  readonly executeStudy: boolean;
  readonly candidateSetDir: string | null;
  readonly studyApprovalPath: string | null;
  readonly v4Root: string | null;
  readonly v5Root: string | null;
  readonly classifierConfigDir: string | null;
  readonly recovery1: boolean;
}

const FLAGS_WITH_VALUE = new Set([
  '--candidate-set',
  '--study-approval',
  '--v4-root',
  '--v5-root',
  '--classifier-config-dir',
]);

/**
 * Closed argument parser: an unknown flag is an error, never ignored.
 * There is no `--skip-slot`, `--start-at`, `--only-slot`,
 * `--continue-from`, `--variant`, `--slot-order` or `--output-root` —
 * normal execution names a candidate set and an approval, never a slot.
 */
export function parseF0XCliArgs(argv: readonly string[]): F0XCliOptions {
  const options = {
    json: false,
    executeStudy: false,
    candidateSetDir: null as string | null,
    studyApprovalPath: null as string | null,
    v4Root: null as string | null,
    v5Root: null as string | null,
    classifierConfigDir: null as string | null,
    recovery1: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--json') options.json = true;
    else if (arg === '--execute-study') options.executeStudy = true;
    else if (arg === '--recovery-1') options.recovery1 = true;
    else if (FLAGS_WITH_VALUE.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${arg} requires a value.`);
      i += 1;
      if (arg === '--candidate-set') options.candidateSetDir = value;
      else if (arg === '--study-approval') options.studyApprovalPath = value;
      else if (arg === '--v4-root') options.v4Root = value;
      else if (arg === '--v5-root') options.v5Root = value;
      else options.classifierConfigDir = value;
    } else throw new Error(`unknown argument ${JSON.stringify(arg)}.`);
  }
  return options;
}

export function createF0XProductionLauncher(): ChildLauncher {
  return {
    launch: (input) =>
      runProcessIsolatedBatch({
        modulePath: CHILD_ENTRY_PATH,
        args: ['--manifest', input.manifestPath],
        watchdogMs: input.watchdogMs,
        graceMs: input.graceMs,
        childEnv: input.childEnv,
      }),
  };
}

export interface F0XCliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nowUtc: () => Date;
  readonly launcher: ChildLauncher;
}

export function loadRegistry(repoRoot: string): StudySlotRegistry {
  return loadStudySlotRegistry(readFileSync(join(repoRoot, F0V_FREEZE_PATH)));
}

export function outputRootProbes(): OutputRootProbes {
  return {
    realpath: (path) => realpathSync.native(path),
    isDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory();
      } catch {
        return false;
      }
    },
  };
}

/**
 * SLOT-SCOPED: `outputRoot` is always the SLOT'S OWN frozen output root
 * (never `F0V_STUDY_ROOT` — the earlier defect this closes was checking the
 * study root, under which no coordinator marker ever lives). Treats EITHER
 * a matching valid F0X outer-slot-identity record OR the coordinator's own
 * matching legacy `authorisations/<sha>.json` marker as spent, per
 * `outerSlotIdentity.ts`'s consumption-semantics contract.
 */
export function isF0XSlotAuthorisationConsumed(
  authorisationSha256: string,
  outputRoot: string,
): boolean {
  return (
    isConsumedByOuterSlotIdentity(outputRoot, authorisationSha256, (p) => readFileSync(p)) ||
    isAuthorisationConsumed(outputRoot, authorisationSha256)
  );
}

export function sequencingProbes(): SlotEvidenceProbes {
  return {
    isDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory();
      } catch {
        return false;
      }
    },
    listFilesRecursively,
    readFile: (path) => readFileSync(path),
  };
}

/** Real, read-only probes for the recovery-1 study-level preflight. */
export function createRecovery1PreflightProbes(repoRoot: string): Recovery1PreflightProbes {
  return {
    readFile: (path) => readFileSync(path),
    sha256: sha256Hex,
    inventoryProbes: createReadOnlyInventoryProbes(),
    isRealDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory() && realpathSync.native(path) === path;
      } catch {
        return false;
      }
    },
    listDirectoryEntries: (path) => readdirSync(path),
    commitIsAncestorOfHead: (commit) => {
      try {
        execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', commit, 'HEAD'], {
          shell: false,
          windowsHide: true,
          timeout: 30_000,
          stdio: ['ignore', 'ignore', 'ignore'],
        });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The ONLY production way to obtain the recovery-1 binding: the pinned overlay bytes in this repository. */
export function loadProductionRecovery1Binding(repoRoot: string): Recovery1Binding {
  return loadRecovery1OverlayFromBytes(readFileSync(join(repoRoot, F0X_RECOVERY_1_OVERLAY_PATH)));
}

export function createProductionRecovery1Authority(
  repoRoot: string,
  binding: Recovery1Binding,
): StudyAuthority {
  const probes = createRecovery1PreflightProbes(repoRoot);
  return createRecovery1Authority(binding, () =>
    evaluateRecovery1StudyPreflight(binding, repoRoot, probes),
  );
}

/**
 * Forbidden output-root containers: the runner repository, every worktree,
 * the failed study root and its control root (always), plus — for recovery-1
 * — the recovery control directory.
 */
export function forbiddenOutputRootContainersFor(
  repoRoot: string,
  binding: Recovery1Binding | null,
): readonly string[] {
  const containers = [
    repoRoot,
    ...listWorktrees(repoRoot),
    F0V_STUDY_ROOT,
    `${F0V_STUDY_ROOT}-control`,
  ];
  if (binding !== null) {
    containers.push(
      binding.overlay.failedStudy.studyRoot,
      binding.overlay.failedStudy.controlRoot,
      binding.overlay.recoveryNamespace.controlDir,
    );
  }
  return [...new Set(containers)];
}

export async function runF0XCli(argv: readonly string[], io: F0XCliIo): Promise<number> {
  let options: F0XCliOptions;
  try {
    options = parseF0XCliArgs(argv);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }

  let binding: Recovery1Binding | null = null;
  let authority: StudyAuthority = ORIGINAL_F0X_STUDY_AUTHORITY;
  if (options.recovery1) {
    binding = loadProductionRecovery1Binding(RUNNER_REPO_ROOT);
    const controlDir = binding.overlay.recoveryNamespace.controlDir;
    for (const [flag, path] of [
      ['--candidate-set', options.candidateSetDir],
      ['--study-approval', options.studyApprovalPath],
    ] as const) {
      if (path !== null && (!isAbsolute(path) || !isStrictlyInside(path, controlDir))) {
        io.stderr(
          `REFUSED: under --recovery-1, ${flag} must be an absolute path inside the recovery control directory ${controlDir}.\n`,
        );
        return 2;
      }
    }
    authority = createProductionRecovery1Authority(RUNNER_REPO_ROOT, binding);
  }

  const registry = loadRegistry(RUNNER_REPO_ROOT);
  const currentHead = (): string => gitCommand(RUNNER_REPO_ROOT, ['rev-parse', 'HEAD']);
  const forbiddenContainers = forbiddenOutputRootContainersFor(RUNNER_REPO_ROOT, binding);
  const studyRoot = authority.studyRoot ?? undefined;
  const candidatePathForSlot = (slotId: string): string | null =>
    options.candidateSetDir === null ? null : join(options.candidateSetDir, `${slotId}.json`);
  const alreadyConsumed = (): boolean => false; // a fresh study never presents an already-consumed hash to its own preflight.

  if (!options.executeStudy) {
    const preflight: AllTenPreflightDecision = runAllTenPreflight({
      registry,
      candidatePathForSlot,
      studyApprovalPath: options.studyApprovalPath,
      readFile: (p) => readFileSync(p),
      sha256: sha256Hex,
      nowUtc: io.nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes: sequencingProbes(),
      outputRootProbes: outputRootProbes(),
      forbiddenOutputRootContainers: forbiddenContainers,
      ...(studyRoot === undefined ? {} : { studyRoot }),
      authority,
    });
    const summary = {
      mode: 'PREFLIGHT_ONLY',
      authority: authority.kind,
      executed: false,
      preflight,
    };
    io.stdout(
      options.json ? `${JSON.stringify(summary, null, 2)}\n` : `granted: ${preflight.granted}\n`,
    );
    return preflight.granted ? 0 : 1;
  }

  const missing: string[] = [];
  if (options.candidateSetDir === null) missing.push('--candidate-set');
  if (options.studyApprovalPath === null) missing.push('--study-approval');
  if (options.v4Root === null) missing.push('--v4-root');
  if (options.v5Root === null) missing.push('--v5-root');
  if (options.classifierConfigDir === null) missing.push('--classifier-config-dir');
  if (missing.length > 0) {
    io.stderr(`REFUSED: --execute-study requires ${missing.join(', ')}.\n`);
    return 2;
  }

  const f0i = loadF0IFreezeFromBytes(readFileSync(join(RUNNER_REPO_ROOT, F0I_FREEZE_PATH)));
  const f0o = loadF0OFreezeFromBytes(readFileSync(join(RUNNER_REPO_ROOT, F0O_FREEZE_PATH)));
  const outcome: StudyExecutionOutcome = await runReplicationStudyExecution({
    registry,
    f0iPlan: buildF0IExecutionPlan(f0i.freeze, f0i.rawSha256),
    f0oPlan: buildF0OExecutionPlan(f0o.freeze, f0o.rawSha256),
    executionIntegrationCommit: currentHead(),
    candidatePathForSlot,
    studyApprovalPath: options.studyApprovalPath,
    readFile: (p) => readFileSync(p),
    sha256: sha256Hex,
    currentHead,
    alreadyConsumed: isF0XSlotAuthorisationConsumed,
    sequencingProbes: sequencingProbes(),
    outputRootProbes: outputRootProbes(),
    forbiddenOutputRootContainers: forbiddenContainers,
    authority,
    // Defect-1 closure: the executor resolves every child freeze path
    // against THIS root to a canonical absolute, hash-verified path,
    // exactly as `cliF0O.ts` already did for attempt 4.
    runnerRepoRoot: RUNNER_REPO_ROOT,
    v4Root: options.v4Root!,
    v5Root: options.v5Root!,
    classifierConfigDir: options.classifierConfigDir!,
    parentEnv: io.env,
    platform: terminationPlatformOf(process.platform),
    launcher: io.launcher,
    clock: { nowUtc: io.nowUtc },
  });

  io.stdout(
    `${JSON.stringify({ mode: 'EXECUTE_STUDY', authority: authority.kind, outcome }, null, 2)}\n`,
  );
  return outcome.status === 'COMPLETED_ALL_SLOTS' ? 0 : outcome.status === 'PAUSED' ? 3 : 2;
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  runF0XCli(process.argv.slice(2), {
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

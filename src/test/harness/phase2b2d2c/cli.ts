/**
 * PHASE 2B-2D2C-F1 — THE DEFAULT-SAFE CLI.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/cli.ts [options]
 *
 * DEFAULT = PLAN / PREFLIGHT ONLY. With no `--execute`, the CLI loads and
 * hash-verifies the F0A freeze, reads the DEVELOPMENT canonical corpus and
 * manifest, reconstructs the twelve frozen batches, verifies every
 * serialized input, all twelve assembly identities and all twenty-four
 * final identities, verifies the v1-then-v2 ordering, verifies any variant
 * root supplied, and prints the deterministic execution plan. It makes zero
 * provider, authentication, database and network calls and mutates no
 * output directory. Nothing SDK-bearing is imported on this path.
 *
 * EXECUTION requires the double lock (`--execute` AND `--authorisation
 * <absolute path>`), both variant roots, a validated output root outside
 * every repository worktree, the attempt number and the classifier
 * configuration directory. Every check above runs FIRST; only when all of
 * them and the lock pass does the coordinator fork the first child.
 *
 * This file lives under `src/test/harness/` because the firewall forbids
 * any file outside `src/test/` from importing the Tier-2 harness. It never
 * imports the execution-only production loader; the child does, after the
 * lock.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../../orgunits/classify/constants.js';
import { computeFinalInputSha256 } from '../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../orgunits/classify/outputSchema.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../../orgunits/web/policy.js';
import { runProcessIsolatedBatch, terminationPlatformOf } from '../processIsolatedBatch.js';
import { validateOutputRoot } from './artifacts.js';
import { evaluateExecutionLock } from './authorisation.js';
import { reconstructAndVerifyFrozenBatches } from './batches.js';
import { FREEZE_PATH, FROZEN_VARIANTS, type FrozenVariantName } from './constants.js';
import { isAuthorisationConsumed, runExperiment, type ChildLauncher } from './coordinator.js';
import { loadDevCorpus } from './corpus.js';
import { loadFreezeFromBytes, sha256Hex } from './freeze.js';
import { buildExecutionPlan, planOrderIsFrozen, planSha256 } from './plan.js';
import { verifyVariantRoot, type VariantRootVerification } from './variantRoot.js';
import { createRealVariantRootProbes } from './variantRootProbes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** This worktree's root: the runner's own repository. */
export const RUNNER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..');
export const CHILD_ENTRY_PATH = join(HERE, 'childEntry.mjs');

export interface CliOptions {
  readonly execute: boolean;
  readonly authorisation: string | null;
  readonly outputRoot: string | null;
  readonly attemptNo: number | null;
  readonly v1Root: string | null;
  readonly v2Root: string | null;
  readonly classifierConfigDir: string | null;
  readonly json: boolean;
}

const FLAGS_WITH_VALUE = new Set([
  '--authorisation',
  '--output-root',
  '--attempt-no',
  '--v1-root',
  '--v2-root',
  '--classifier-config-dir',
]);

/** Closed argument parser: an unknown flag is an error, never ignored. */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  const options = {
    execute: false,
    authorisation: null as string | null,
    outputRoot: null as string | null,
    attemptNo: null as number | null,
    v1Root: null as string | null,
    v2Root: null as string | null,
    classifierConfigDir: null as string | null,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--execute') options.execute = true;
    else if (arg === '--json') options.json = true;
    else if (FLAGS_WITH_VALUE.has(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--'))
        throw new Error(`${arg} requires a value.`);
      i += 1;
      if (arg === '--authorisation') options.authorisation = value;
      else if (arg === '--output-root') options.outputRoot = value;
      else if (arg === '--v1-root') options.v1Root = value;
      else if (arg === '--v2-root') options.v2Root = value;
      else if (arg === '--classifier-config-dir') options.classifierConfigDir = value;
      else {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1)
          throw new Error('--attempt-no must be a positive integer.');
        options.attemptNo = parsed;
      }
    } else throw new Error(`unknown argument ${JSON.stringify(arg)}.`);
  }
  return options;
}

function listWorktrees(repoRoot: string): string[] {
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

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nowUtc: () => Date;
  readonly launcher: ChildLauncher;
}

export function createProductionLauncher(): ChildLauncher {
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

/** Runs the CLI. Returns the process exit code; never calls `process.exit` itself. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const options = parseCliArgs(argv);
  const freezePath = join(RUNNER_REPO_ROOT, FREEZE_PATH);
  const loaded = loadFreezeFromBytes(readFileSync(freezePath));
  const corpus = loadDevCorpus(loaded.freeze, {
    read: (relative) => readFileSync(join(RUNNER_REPO_ROOT, relative)),
  });
  const batches = reconstructAndVerifyFrozenBatches(loaded.freeze, corpus.rows, {
    canonicalStringify,
    computeFinalInputSha256,
    ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
    fetchPolicyVersion: FETCH_POLICY_VERSION,
    assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  });
  const plan = buildExecutionPlan(loaded.freeze, loaded.rawSha256, batches);
  if (!planOrderIsFrozen(plan))
    throw new Error('the execution plan is not in the frozen v1-then-v2 order.');

  const roots: Partial<Record<FrozenVariantName, string>> = {};
  if (options.v1Root !== null) roots.PROMPT_V1_CANONICAL = options.v1Root;
  if (options.v2Root !== null) roots.PROMPT_V2_CANONICAL = options.v2Root;
  const verifications: VariantRootVerification[] = [];
  const probes = createRealVariantRootProbes();
  for (const variant of FROZEN_VARIANTS) {
    const root = roots[variant.name];
    if (root !== undefined)
      verifications.push(await verifyVariantRoot(variant, root, loaded.freeze, probes));
  }
  const rootsOk = verifications.every((v) => v.ok);

  const summary = {
    mode: options.execute ? 'EXECUTE_REQUESTED' : 'PLAN_ONLY',
    freezeConfigRawSha256: loaded.rawSha256,
    freezeVersion: loaded.freeze.version,
    corpus: {
      rawSha256: corpus.corpusRawSha256,
      manifestRawSha256: corpus.manifestRawSha256,
      contentSha256: corpus.contentSha256,
      rows: corpus.rows.length,
    },
    planSha256: planSha256(plan),
    plannedLogicalEvaluations: plan.plannedLogicalEvaluations,
    variantRoots: verifications.map((v) => ({
      variantName: v.variantName,
      root: v.root,
      ok: v.ok,
      checks: v.checks,
    })),
  };

  if (!options.execute) {
    io.stdout(
      options.json
        ? `${JSON.stringify({ ...summary, plan }, null, 2)}\n`
        : renderPlanText(summary, plan),
    );
    return rootsOk ? 0 : 1;
  }

  // EXECUTION PATH — every gate, in order, before the first child.
  const missing: string[] = [];
  if (options.v1Root === null) missing.push('--v1-root');
  if (options.v2Root === null) missing.push('--v2-root');
  if (options.outputRoot === null) missing.push('--output-root');
  if (options.attemptNo === null) missing.push('--attempt-no');
  if (options.classifierConfigDir === null) missing.push('--classifier-config-dir');
  if (options.authorisation === null) missing.push('--authorisation');
  if (missing.length > 0) {
    io.stderr(`REFUSED: execution requires ${missing.join(', ')}.\n`);
    return 2;
  }
  if (!rootsOk) {
    io.stderr(
      `REFUSED: a variant root failed verification.\n${JSON.stringify(summary.variantRoots, null, 2)}\n`,
    );
    return 2;
  }
  // F1A/F0B: execution happens only on the platform whose SDK-bundled binary
  // the freeze PINS by hash. Plan mode verifies roots anywhere; execution
  // does not proceed on a platform where the binary identity is merely
  // recorded.
  const runPlatform = loaded.freeze.classifier.claudeCodeExecutable.runPlatform;
  const verifiedExecutables = verifications.map((v) => v.claudeCodeExecutable);
  if (verifiedExecutables.some((e) => e === null || !e.onFrozenRunPlatform)) {
    io.stderr(
      `REFUSED: execution is frozen to ${runPlatform.platformKey}; this process is ` +
        `${process.platform}-${process.arch}, where the SDK-bundled binary identity is not pinned.\n`,
    );
    return 2;
  }
  const outputRootDecision = validateOutputRoot(
    options.outputRoot!,
    [RUNNER_REPO_ROOT, options.v1Root!, options.v2Root!, ...listWorktrees(RUNNER_REPO_ROOT)],
    {
      realpath: (path) => realpathSync.native(path),
      isDirectory: (path) => {
        try {
          return lstatSync(path).isDirectory();
        } catch {
          return false;
        }
      },
    },
  );
  if (!outputRootDecision.ok) {
    io.stderr(`REFUSED: output root ${outputRootDecision.refusal}: ${outputRootDecision.detail}\n`);
    return 2;
  }
  const lock = evaluateExecutionLock({
    executeFlag: options.execute,
    authorisationPath: options.authorisation,
    expected: { outputRoot: outputRootDecision.outputRoot, attemptNo: options.attemptNo! },
    readFile: (path) => readFileSync(path),
    sha256: sha256Hex,
    alreadyConsumed: (sha) => isAuthorisationConsumed(outputRootDecision.outputRoot, sha),
    nowUtc: io.nowUtc,
  });
  if (!lock.granted) {
    io.stderr(`REFUSED: execution lock ${lock.refusal}: ${lock.detail}\n`);
    return 2;
  }
  const result = await runExperiment({
    plan,
    freezePath,
    outputRoot: outputRootDecision.outputRoot,
    attemptNo: options.attemptNo!,
    authorisation: lock.authorisation,
    authorisationSha256: lock.authorisationSha256,
    variantRoots: { PROMPT_V1_CANONICAL: options.v1Root!, PROMPT_V2_CANONICAL: options.v2Root! },
    classifierConfigDir: options.classifierConfigDir!,
    parentEnv: io.env,
    platform: terminationPlatformOf(process.platform),
    launcher: io.launcher,
    clock: { nowUtc: io.nowUtc },
  });
  io.stdout(`${JSON.stringify({ ...summary, experiment: result }, null, 2)}\n`);
  return result.status === 'COMPLETED_ALL_PLANNED' ? 0 : 3;
}

function renderPlanText(
  summary: Record<string, unknown>,
  plan: ReturnType<typeof buildExecutionPlan>,
): string {
  const lines: string[] = [
    'PHASE 2B-2D2C-F1 DEV runner — PLAN ONLY (no provider, auth, database or network call was made)',
    `freeze ${String(summary['freezeVersion'])} raw sha256 ${String(summary['freezeConfigRawSha256'])}`,
    `plan sha256 ${String(summary['planSha256'])}; ${plan.plannedLogicalEvaluations} logical evaluations, concurrency 1`,
    `requested model ${plan.requestedModelId}; runConfig ${JSON.stringify(plan.runConfig)}`,
    `tier1 ${plan.liveness.tier1SoftDeadlineMs}/${plan.liveness.tier1GraceMs}/${plan.liveness.tier1TotalBudgetMs} ms; tier2 ${plan.liveness.tier2WatchdogMs}/${plan.liveness.tier2GraceMs} ms`,
    '',
    'seq  variant               ord  organisation                               docs  finalInputSha256',
  ];
  for (const e of plan.evaluations) {
    lines.push(
      `${String(e.sequence).padStart(3)}  ${e.variantName.padEnd(21)} ${String(e.logicalBatchOrdinal).padStart(3)}  ${e.echeRowKey.padEnd(42)} ${String(e.orderedDocIndices.length).padStart(4)}  ${e.finalInputSha256}`,
    );
  }
  const roots = summary['variantRoots'] as readonly {
    variantName: string;
    root: string;
    ok: boolean;
    checks: readonly { id: string; ok: boolean; detail: string }[];
  }[];
  if (roots.length > 0) {
    lines.push('');
    for (const root of roots) {
      lines.push(`${root.variantName} root ${root.root}: ${root.ok ? 'VERIFIED' : 'REFUSED'}`);
      for (const check of root.checks)
        lines.push(`  ${check.ok ? 'ok ' : 'FAIL'} ${check.id}: ${check.detail}`);
    }
  }
  lines.push(
    '',
    'Execution requires BOTH --execute AND --authorisation <absolute path>; neither alone enables anything.',
  );
  return `${lines.join('\n')}\n`;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: { ...process.env },
    nowUtc: () => new Date(),
    launcher: createProductionLauncher(),
  }).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      process.stderr.write(
        `REFUSED: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`,
      );
      process.exitCode = 2;
    },
  );
}

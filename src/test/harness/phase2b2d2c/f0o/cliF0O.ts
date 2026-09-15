/**
 * PHASE 2B-2D2C-F0P — THE ATTEMPT-4 DEFAULT-SAFE CLI.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0o/cliF0O.ts [options]
 *
 * DEFAULT = PLAN / READINESS ONLY. With no `--execute`, the CLI loads and
 * hash-verifies the F0O freeze, verifies the F0O owner-approval record by
 * exact hash, verifies the F0B, F0E AND F0I predecessor bytes (and their own
 * approval/ratification records) byte-identical, reads the DEVELOPMENT
 * canonical corpus and manifest, reconstructs the twelve frozen batches
 * through this worktree's production algorithms, verifies every serialized
 * input, every assembly identity, every V5 final identity, every attempt-1
 * comparator identity (V1, V2) the freeze carries AND cross-checks every
 * attempt-2 comparator identity (V3, against the live F0E freeze) and every
 * attempt-3 comparator identity (V4, against the live F0I freeze), rebuilds
 * the attempt-4 plan, verifies its order and its SHA-256 against the
 * approved value, recomputes the mechanical call ceiling, checks the
 * HOLDOUT boundary, verifies the V5 root if one is supplied, and verifies
 * the attempt-1, attempt-2 AND attempt-3 comparator roots READ-ONLY if
 * supplied. It makes zero provider, authentication, database and network
 * calls and mutates no directory. Nothing SDK-bearing is imported on this
 * path.
 *
 * EXECUTION requires the attempt-4 lock (`--execute` AND `--authorisation
 * <absolute path>` naming a NEW owner authorisation of the attempt-4
 * shape), the V5 root, an EMPTY output root outside every repository
 * worktree and outside the attempt-1, attempt-2 AND attempt-3 roots,
 * `--attempt-no 4`, the classifier configuration directory, and read-only
 * `--attempt1-root`/`--attempt2-root`/`--attempt3-root`. Every readiness
 * check above runs FIRST; only when all of them and the lock pass does the
 * coordinator fork the first child. Attempt-1, attempt-2 and attempt-3
 * evidence are never written into, and never read as anything but
 * comparators.
 *
 * Attempt 4 is a FRESH semantic attempt: unlike the attempt-3 CLI (F0K),
 * there is no preserved prior attempt-4 evidence to classify and no
 * replacement gate — `--prior-attemptN-root` does not exist here. Should a
 * future attempt-4 invocation ever need a replacement, that is a
 * separately-reviewed widening, never something this module pre-empts.
 *
 * `--verify-authorisation-candidate <absolute path>` is REFUSED in
 * combination with `--execute`. It validates the supplied output root
 * exactly as the execution path would (absolute, normalised, real, empty,
 * outside every worktree and outside attempt 1, attempt 2 AND attempt 3),
 * then evaluates the attempt-4 lock against the candidate bytes through the
 * verification-only entry and REPORTS the decision. It creates nothing,
 * consumes nothing, constructs no provider and launches no child: a
 * candidate reported STRUCTURALLY_ACCEPTABLE has still authorised nothing.
 *
 * This file lives under `src/test/harness/` for the same reason the
 * attempt-1/2/3 CLIs do: the firewall forbids any file outside `src/test/`
 * from importing the Tier-2 harness. It never imports the execution-only
 * production loader; the child does, after the lock.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../../../orgunits/classify/constants.js';
import { computeFinalInputSha256 } from '../../../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../../../orgunits/classify/outputSchema.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../../../orgunits/web/policy.js';
import { runProcessIsolatedBatch, terminationPlatformOf } from '../../processIsolatedBatch.js';
import { validateOutputRoot } from '../artifacts.js';
import { reconstructFrozenBatches } from '../batches.js';
import { EXPECTED_F0B_FREEZE_RAW_SHA256, FREEZE_PATH } from '../constants.js';
import { isAuthorisationConsumed, runExperiment, type ChildLauncher } from '../coordinator.js';
import { loadDevCorpus } from '../corpus.js';
import { sha256Hex } from '../freeze.js';
import {
  F0E_APPROVAL_RECORD_PATH,
  F0E_APPROVAL_RECORD_RAW_SHA256,
  F0E_FREEZE_PATH,
  F0E_VARIANT,
  loadF0EFreezeFromBytes,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
} from '../f0c/freezeF0E.js';
import {
  ATTEMPT_3_NO,
  ATTEMPT_3_VARIANT_NAME,
  F0I_APPROVAL_RECORD_PATH,
  F0I_APPROVAL_RECORD_RAW_SHA256,
  F0I_FREEZE_PATH,
  F0I_RATIFICATION_RECORD_PATH,
  F0I_RATIFICATION_RECORD_RAW_SHA256,
  loadF0IFreezeFromBytes,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
} from '../f0i/freezeF0I.js';
import { loadAttempt2ScoringSources } from '../scoring/attempt2Sources.js';
import { loadAttempt3ScoringSources } from '../scoring/attempt3Sources.js';
import { loadScoringSources } from '../scoring/sources.js';
import { createRealVariantRootProbes } from '../variantRootProbes.js';
import type { VariantRootProbes, VariantRootVerification } from '../variantRoot.js';
import {
  ATTEMPT4_AUTHORISATION_VERSION,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
  evaluateAttempt4ExecutionLock,
  verifyAttempt4AuthorisationCandidate,
} from './authorisationF0O.js';
import { Attempt4FreezeError } from './attempt4FreezeCore.js';
import {
  ATTEMPT_4_NO,
  ATTEMPT_4_VARIANT_NAME,
  buildF0OExecutionPlan,
  deriveCallCeiling,
  F0O_APPROVAL_RECORD_PATH,
  F0O_APPROVAL_RECORD_RAW_SHA256,
  F0O_FREEZE_PATH,
  F0O_VARIANT,
  f0oPlanOrderIsFrozen,
  f0oPlanSha256,
  loadF0OFreezeFromBytes,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
  type F0OExecutionPlan,
  type F0OFreeze,
} from './freezeF0O.js';
import { f0oBatchMismatches, holdoutBoundaryViolationsF0O } from './planVerificationF0O.js';
import { verifyV5Root } from './variantRootF0O.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** This worktree's root: the runner's own repository. */
export const RUNNER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');
/** The SAME Tier-2 child entry attempt 1/2/3 used; it resolves the freeze family by hash. */
export const CHILD_ENTRY_PATH = join(HERE, '..', 'childEntry.mjs');

export interface F0OCliOptions {
  readonly execute: boolean;
  readonly authorisation: string | null;
  readonly outputRoot: string | null;
  readonly attemptNo: number | null;
  readonly v5Root: string | null;
  /** The preserved attempt-1 root, verified READ-ONLY as a comparator; never written. */
  readonly attempt1Root: string | null;
  /** The preserved attempt-2 root, verified READ-ONLY as a comparator; never written. */
  readonly attempt2Root: string | null;
  /** The preserved attempt-3 root, verified READ-ONLY as a comparator; never written. */
  readonly attempt3Root: string | null;
  readonly classifierConfigDir: string | null;
  readonly verifyAuthorisationCandidate: string | null;
  readonly json: boolean;
}

const FLAGS_WITH_VALUE = new Set([
  '--authorisation',
  '--output-root',
  '--attempt-no',
  '--v5-root',
  '--attempt1-root',
  '--attempt2-root',
  '--attempt3-root',
  '--classifier-config-dir',
  '--verify-authorisation-candidate',
]);

/** Closed argument parser: an unknown flag is an error, never ignored. There is no `--v1-root`, `--v2-root`, `--v3-root`, `--v4-root` or `--all`. */
export function parseF0OCliArgs(argv: readonly string[]): F0OCliOptions {
  const options = {
    execute: false,
    authorisation: null as string | null,
    outputRoot: null as string | null,
    attemptNo: null as number | null,
    v5Root: null as string | null,
    attempt1Root: null as string | null,
    attempt2Root: null as string | null,
    attempt3Root: null as string | null,
    classifierConfigDir: null as string | null,
    verifyAuthorisationCandidate: null as string | null,
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
      else if (arg === '--v5-root') options.v5Root = value;
      else if (arg === '--attempt1-root') options.attempt1Root = value;
      else if (arg === '--attempt2-root') options.attempt2Root = value;
      else if (arg === '--attempt3-root') options.attempt3Root = value;
      else if (arg === '--classifier-config-dir') options.classifierConfigDir = value;
      else if (arg === '--verify-authorisation-candidate')
        options.verifyAuthorisationCandidate = value;
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

export interface F0OCliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nowUtc: () => Date;
  readonly launcher: ChildLauncher;
  /** Test seam: root probes over a synthetic root. Production passes nothing and gets the real Git and filesystem probes. */
  readonly rootProbes?: VariantRootProbes;
}

export function createF0OProductionLauncher(): ChildLauncher {
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

// ---------------------------------------------------------------------------
// Readiness checks (request-free, provider-free, write-free).
// ---------------------------------------------------------------------------

export interface ReadinessCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

function refuseReadiness(id: string, detail: string): never {
  throw new Attempt4FreezeError('CORPUS_CONFIG_OR_HASH_DRIFT', `${id}: ${detail}`);
}

/**
 * The F0O owner freeze-approval record, by exact hash. It is already
 * recorded and pinned in `freezeF0O.ts`; this re-verifies that the
 * committed bytes still hash to the pinned value and still name exactly the
 * frozen bytes/plan, rather than trusting the pin blindly. Unlike F0I, F0O
 * carries no separate ratification record: its one approval record was
 * written whole in the same session that recorded it.
 */
export function verifyF0OApprovalChain(repoRoot: string): readonly ReadinessCheck[] {
  if (F0O_APPROVAL_RECORD_RAW_SHA256 === null) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RECORD_F0O',
      `no F0O approval hash is pinned; the F0O freeze is PROPOSED and authorises nothing.${
        existsSync(join(repoRoot, F0O_APPROVAL_RECORD_PATH ?? ''))
          ? ' (A file exists at that path but is NOT pinned; it is not trusted.)'
          : ''
      }`,
    );
  }
  const approvalBytes = readFileSync(join(repoRoot, F0O_APPROVAL_RECORD_PATH as string));
  const approvalSha = sha256Hex(approvalBytes);
  if (approvalSha !== F0O_APPROVAL_RECORD_RAW_SHA256) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RECORD_F0O',
      `${F0O_APPROVAL_RECORD_PATH} hashes to ${approvalSha}; the pinned approval record is ${F0O_APPROVAL_RECORD_RAW_SHA256}.`,
    );
  }
  const approval = JSON.parse(approvalBytes.toString('utf8')) as {
    recordKind?: unknown;
    approvedFreeze?: { rawSha256?: unknown; derivedAttempt4PlanSha256?: unknown };
    thisRecordAuthorises?: unknown;
  };
  if (
    approval.recordKind !== 'OWNER_FREEZE_APPROVAL' ||
    approval.approvedFreeze?.rawSha256 !== PROPOSED_F0O_FREEZE_RAW_SHA256 ||
    approval.approvedFreeze?.derivedAttempt4PlanSha256 !== PROPOSED_F0O_PLAN_SHA256 ||
    !Array.isArray(approval.thisRecordAuthorises) ||
    approval.thisRecordAuthorises.length !== 0
  ) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RECORD_F0O',
      'the F0O approval record does not name exactly the frozen bytes and plan, or claims to authorise something.',
    );
  }
  return [
    {
      id: 'OWNER_FREEZE_APPROVAL_RECORD_F0O',
      ok: true,
      detail: `${approvalSha} (recorded and pinned)`,
    },
  ];
}

/**
 * F0O's per-batch `attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL`
 * is defined ("freezeF0O.ts") as copied VERBATIM from F0E's own
 * `finalInputSha256.PROMPT_V3_CANONICAL` for the same ordinal.
 */
export function verifyV3ComparatorCopiedFromF0E(
  f0o: F0OFreeze,
  f0e: ReturnType<typeof loadF0EFreezeFromBytes>['freeze'],
): readonly string[] {
  const problems: string[] = [];
  const f0eByOrdinal = new Map(f0e.batching.plan.map((b) => [b.ordinal, b]));
  for (const batch of f0o.batching.plan) {
    const f0eBatch = f0eByOrdinal.get(batch.ordinal);
    if (f0eBatch === undefined) {
      problems.push(`ordinal ${batch.ordinal}: no matching F0E batch`);
      continue;
    }
    if (
      batch.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL !==
      f0eBatch.finalInputSha256.PROMPT_V3_CANONICAL
    ) {
      problems.push(
        `ordinal ${batch.ordinal}: attempt2ComparatorFinalInputSha256 != F0E's own V3 identity`,
      );
    }
  }
  return problems;
}

/**
 * F0O's per-batch `attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL`
 * is defined ("freezeF0O.ts") as copied VERBATIM from F0I's own
 * `finalInputSha256.PROMPT_V4_CANONICAL` for the same ordinal.
 */
export function verifyV4ComparatorCopiedFromF0I(
  f0o: F0OFreeze,
  f0i: ReturnType<typeof loadF0IFreezeFromBytes>['freeze'],
): readonly string[] {
  const problems: string[] = [];
  const f0iByOrdinal = new Map(f0i.batching.plan.map((b) => [b.ordinal, b]));
  for (const batch of f0o.batching.plan) {
    const f0iBatch = f0iByOrdinal.get(batch.ordinal);
    if (f0iBatch === undefined) {
      problems.push(`ordinal ${batch.ordinal}: no matching F0I batch`);
      continue;
    }
    if (
      batch.attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL !==
      f0iBatch.finalInputSha256.PROMPT_V4_CANONICAL
    ) {
      problems.push(
        `ordinal ${batch.ordinal}: attempt3ComparatorFinalInputSha256 != F0I's own V4 identity`,
      );
    }
  }
  return problems;
}

export interface ComparatorVerification {
  readonly root: string;
  readonly ok: boolean;
  readonly artifactInventorySha256: string;
  readonly artifactsVerified: number;
  readonly planSha256: string;
  readonly containsNoAttempt4Namespace: boolean;
  readonly detail: string;
}

/**
 * READ-ONLY: the preserved attempt-1 root is loaded through the F4 scorer's
 * own verifying loader (every artifact hash-verified, nothing written) and
 * its inventory must equal the value the F0O freeze pins as the attempt-1
 * comparator. It must also hold no attempt-2, attempt-3 or attempt-4
 * namespace of any kind.
 */
export function verifyAttempt1ComparatorF0O(
  repoRoot: string,
  freeze: F0OFreeze,
  attempt1Root: string,
): ComparatorVerification {
  const comparator = freeze.scoring.comparatorPolicy.attempt1;
  const sources = loadScoringSources(repoRoot, attempt1Root);
  const evaluationsDir = join(attempt1Root, 'evaluations');
  const variantDirs = readdirSync(evaluationsDir).sort();
  const experimentDirs = readdirSync(join(attempt1Root, 'experiments')).sort();
  const foreignVariants = [F0E_VARIANT.name, ATTEMPT_3_VARIANT_NAME, F0O_VARIANT.name];
  const foreignExperiments = [`attempt-2`, `attempt-${ATTEMPT_3_NO}`, `attempt-${ATTEMPT_4_NO}`];
  const containsNoAttempt4Namespace =
    !variantDirs.some((v) => foreignVariants.includes(v)) &&
    !experimentDirs.some((e) => foreignExperiments.includes(e));
  const problems: string[] = [];
  if (sources.artifactInventorySha256 !== comparator.artifactInventorySha256) {
    problems.push(
      `inventory ${sources.artifactInventorySha256} != frozen comparator ${comparator.artifactInventorySha256}`,
    );
  }
  if (sources.freezeRawSha256 !== comparator.freezeRawSha256) problems.push('comparator freeze');
  if (sources.artifactsVerified !== comparator.artifactCount)
    problems.push(`artifact count ${sources.artifactsVerified}`);
  if (sources.planSha256 !== comparator.planSha256) problems.push('comparator plan');
  if (!containsNoAttempt4Namespace)
    problems.push('an attempt-2, attempt-3 or attempt-4 namespace exists inside attempt 1');
  return {
    root: attempt1Root,
    ok: problems.length === 0,
    artifactInventorySha256: sources.artifactInventorySha256,
    artifactsVerified: sources.artifactsVerified,
    planSha256: sources.planSha256,
    containsNoAttempt4Namespace,
    detail:
      problems.length === 0
        ? `${sources.artifactsVerified} artifacts hash-verified read-only; inventory equals the frozen comparator`
        : problems.join('; '),
  };
}

/**
 * READ-ONLY: the preserved attempt-2 root is loaded through
 * `loadAttempt2ScoringSources`; its identities must additionally equal the
 * values the F0O freeze pins as the attempt-2 comparator, and it must hold
 * no attempt-3 or attempt-4 namespace.
 */
export function verifyAttempt2ComparatorF0O(
  repoRoot: string,
  freeze: F0OFreeze,
  attempt2Root: string,
): ComparatorVerification {
  const comparator = freeze.scoring.comparatorPolicy.attempt2;
  const sources = loadAttempt2ScoringSources(repoRoot, attempt2Root);
  const variantDirs = readdirSync(join(attempt2Root, 'evaluations')).sort();
  const experimentDirs = readdirSync(join(attempt2Root, 'experiments')).sort();
  const containsNoAttempt4Namespace =
    !variantDirs.some((v) => v === ATTEMPT_3_VARIANT_NAME || v === F0O_VARIANT.name) &&
    !experimentDirs.some((e) => e === `attempt-${ATTEMPT_3_NO}` || e === `attempt-${ATTEMPT_4_NO}`);
  const problems: string[] = [];
  if (sources.artifactInventorySha256 !== comparator.primaryArtifactInventorySha256) {
    problems.push('primary artifact inventory');
  }
  if (sources.artifactsVerified !== comparator.primaryArtifactCount) {
    problems.push(`primary artifact count ${sources.artifactsVerified}`);
  }
  if (sources.repairArtifactInventory.sha256 !== comparator.repairArtifactInventorySha256) {
    problems.push('repair artifact inventory');
  }
  if (sources.repairArtifactInventory.count !== comparator.repairArtifactCount) {
    problems.push(`repair artifact count ${sources.repairArtifactInventory.count}`);
  }
  if (sources.freezeRawSha256 !== comparator.freezeRawSha256) problems.push('comparator freeze');
  if (sources.authorisationSha256 !== comparator.authorisationSha256)
    problems.push('comparator authorisation');
  if (sources.planSha256 !== comparator.planSha256) problems.push('comparator plan');
  if (!containsNoAttempt4Namespace)
    problems.push('an attempt-3 or attempt-4 namespace exists inside attempt 2');
  return {
    root: attempt2Root,
    ok: problems.length === 0,
    artifactInventorySha256: sources.artifactInventorySha256,
    artifactsVerified: sources.artifactsVerified,
    planSha256: sources.planSha256,
    containsNoAttempt4Namespace,
    detail:
      problems.length === 0
        ? `${sources.artifactsVerified} primary + ${sources.repairArtifactInventory.count} repair artifacts hash-verified read-only; inventories equal the frozen comparator`
        : problems.join('; '),
  };
}

/**
 * READ-ONLY: the preserved attempt-3 root is loaded through
 * `loadAttempt3ScoringSources`; its identities must additionally equal the
 * values the F0O freeze pins as the attempt-3 comparator, and it must hold
 * no attempt-4 namespace.
 */
export function verifyAttempt3ComparatorF0O(
  repoRoot: string,
  freeze: F0OFreeze,
  attempt3Root: string,
): ComparatorVerification {
  const comparator = freeze.scoring.comparatorPolicy.attempt3;
  const sources = loadAttempt3ScoringSources(repoRoot, attempt3Root);
  const variantDirs = readdirSync(join(attempt3Root, 'evaluations')).sort();
  const experimentDirs = readdirSync(join(attempt3Root, 'experiments')).sort();
  const containsNoAttempt4Namespace =
    !variantDirs.includes(F0O_VARIANT.name) && !experimentDirs.includes(`attempt-${ATTEMPT_4_NO}`);
  const problems: string[] = [];
  if (sources.artifactInventorySha256 !== comparator.primaryArtifactInventorySha256) {
    problems.push('primary artifact inventory');
  }
  if (sources.artifactsVerified !== comparator.primaryArtifactCount) {
    problems.push(`primary artifact count ${sources.artifactsVerified}`);
  }
  if (sources.repairArtifactInventory.sha256 !== comparator.repairArtifactInventorySha256) {
    problems.push('repair artifact inventory');
  }
  if (sources.repairArtifactInventory.count !== comparator.repairArtifactCount) {
    problems.push(`repair artifact count ${sources.repairArtifactInventory.count}`);
  }
  if (sources.freezeRawSha256 !== comparator.freezeRawSha256) problems.push('comparator freeze');
  if (sources.authorisationSha256 !== comparator.authorisationSha256)
    problems.push('comparator authorisation');
  if (sources.planSha256 !== comparator.planSha256) problems.push('comparator plan');
  if (!containsNoAttempt4Namespace) problems.push('an attempt-4 namespace exists inside attempt 3');
  return {
    root: attempt3Root,
    ok: problems.length === 0,
    artifactInventorySha256: sources.artifactInventorySha256,
    artifactsVerified: sources.artifactsVerified,
    planSha256: sources.planSha256,
    containsNoAttempt4Namespace,
    detail:
      problems.length === 0
        ? `${sources.artifactsVerified} primary + ${sources.repairArtifactInventory.count} repair artifacts hash-verified read-only; inventories equal the frozen comparator`
        : problems.join('; '),
  };
}

// ---------------------------------------------------------------------------
// The CLI.
// ---------------------------------------------------------------------------

/** Runs the attempt-4 CLI. Returns the process exit code; never calls `process.exit` itself. */
export async function runF0OCli(argv: readonly string[], io: F0OCliIo): Promise<number> {
  const options = parseF0OCliArgs(argv);
  const readiness: ReadinessCheck[] = [];

  // Candidate verification is a plan-only activity. It is refused together
  // with --execute BEFORE anything else, so a candidate can never be
  // verified and executed by one invocation.
  if (options.verifyAuthorisationCandidate !== null && options.execute) {
    io.stderr(
      'REFUSED: CANDIDATE_VERIFICATION_EXCLUDES_EXECUTION: --verify-authorisation-candidate is plan-only and cannot be combined with --execute; an issued authorisation is presented with --authorisation instead.\n',
    );
    return 2;
  }

  // 1. The F0O freeze, by hash, then shape, then production agreement.
  const freezePath = join(RUNNER_REPO_ROOT, F0O_FREEZE_PATH);
  const loaded = loadF0OFreezeFromBytes(readFileSync(freezePath));
  if (loaded.rawSha256 !== PROPOSED_F0O_FREEZE_RAW_SHA256) {
    refuseReadiness(
      'PROPOSED_F0O_FREEZE',
      `raw SHA-256 ${loaded.rawSha256} is not the pinned value.`,
    );
  }
  readiness.push({
    id: 'PROPOSED_F0O_FREEZE',
    ok: true,
    detail: `${loaded.rawSha256} (${loaded.rawBytes} bytes); runtime ${F0O_VARIANT.gitCommit}`,
  });
  const { freeze } = loaded;

  // 2. The F0O owner-approval record, by exact hash.
  readiness.push(...verifyF0OApprovalChain(RUNNER_REPO_ROOT));

  // 3. The F0B (attempt 1), F0E (attempt 2) and F0I (attempt 3) predecessor bytes are byte-identical.
  const f0bSha256 = sha256Hex(readFileSync(join(RUNNER_REPO_ROOT, FREEZE_PATH)));
  if (
    f0bSha256 !== EXPECTED_F0B_FREEZE_RAW_SHA256 ||
    f0bSha256 !== freeze.predecessor.attempt1.rawSha256
  ) {
    refuseReadiness('F0B_PREDECESSOR_BYTE_IDENTICAL', `F0B hashes to ${f0bSha256}.`);
  }
  readiness.push({ id: 'F0B_PREDECESSOR_BYTE_IDENTICAL', ok: true, detail: f0bSha256 });
  const f0eLoaded = loadF0EFreezeFromBytes(readFileSync(join(RUNNER_REPO_ROOT, F0E_FREEZE_PATH)));
  if (
    f0eLoaded.rawSha256 !== PROPOSED_F0E_FREEZE_RAW_SHA256 ||
    f0eLoaded.rawSha256 !== freeze.predecessor.attempt2.rawSha256
  ) {
    refuseReadiness('F0E_PREDECESSOR_BYTE_IDENTICAL', `F0E hashes to ${f0eLoaded.rawSha256}.`);
  }
  if (F0E_APPROVAL_RECORD_RAW_SHA256 === null) {
    refuseReadiness('F0E_PREDECESSOR_BYTE_IDENTICAL', 'no F0E approval hash is pinned.');
  }
  const f0eApprovalSha256 = sha256Hex(
    readFileSync(join(RUNNER_REPO_ROOT, F0E_APPROVAL_RECORD_PATH)),
  );
  if (
    f0eApprovalSha256 !== F0E_APPROVAL_RECORD_RAW_SHA256 ||
    f0eApprovalSha256 !== freeze.predecessor.attempt2.approvalRecordRawSha256
  ) {
    refuseReadiness('F0E_PREDECESSOR_BYTE_IDENTICAL', 'F0E approval record hash mismatch.');
  }
  readiness.push({
    id: 'F0E_PREDECESSOR_BYTE_IDENTICAL',
    ok: true,
    detail: `${f0eLoaded.rawSha256} (approval ${f0eApprovalSha256})`,
  });
  const f0iLoaded = loadF0IFreezeFromBytes(readFileSync(join(RUNNER_REPO_ROOT, F0I_FREEZE_PATH)));
  if (
    f0iLoaded.rawSha256 !== PROPOSED_F0I_FREEZE_RAW_SHA256 ||
    f0iLoaded.rawSha256 !== freeze.predecessor.attempt3.rawSha256
  ) {
    refuseReadiness('F0I_PREDECESSOR_BYTE_IDENTICAL', `F0I hashes to ${f0iLoaded.rawSha256}.`);
  }
  if (F0I_APPROVAL_RECORD_RAW_SHA256 === null || F0I_RATIFICATION_RECORD_RAW_SHA256 === null) {
    refuseReadiness(
      'F0I_PREDECESSOR_BYTE_IDENTICAL',
      'no F0I approval/ratification hash is pinned.',
    );
  }
  const f0iApprovalSha256 = sha256Hex(
    readFileSync(join(RUNNER_REPO_ROOT, F0I_APPROVAL_RECORD_PATH as string)),
  );
  const f0iRatificationSha256 = sha256Hex(
    readFileSync(join(RUNNER_REPO_ROOT, F0I_RATIFICATION_RECORD_PATH as string)),
  );
  if (
    f0iApprovalSha256 !== F0I_APPROVAL_RECORD_RAW_SHA256 ||
    f0iApprovalSha256 !== freeze.predecessor.attempt3.approvalRecordRawSha256
  ) {
    refuseReadiness('F0I_PREDECESSOR_BYTE_IDENTICAL', 'F0I approval record hash mismatch.');
  }
  if (f0iRatificationSha256 !== F0I_RATIFICATION_RECORD_RAW_SHA256) {
    refuseReadiness('F0I_PREDECESSOR_BYTE_IDENTICAL', 'F0I ratification record hash mismatch.');
  }
  readiness.push({
    id: 'F0I_PREDECESSOR_BYTE_IDENTICAL',
    ok: true,
    detail: `${f0iLoaded.rawSha256} (approval ${f0iApprovalSha256}, ratification ${f0iRatificationSha256})`,
  });

  // 4. Corpus, batches, identities — through THIS worktree's production algorithms.
  const corpus = loadDevCorpus(freeze, {
    read: (relative) => readFileSync(join(RUNNER_REPO_ROOT, relative)),
  });
  const batches = reconstructFrozenBatches(corpus.rows, {
    canonicalStringify,
    computeFinalInputSha256,
    ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
    fetchPolicyVersion: FETCH_POLICY_VERSION,
    assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  });
  const versionProblems: string[] = [];
  if (freeze.inputConstruction.context.ruleVersion !== ORGUNIT_SIGNAL_RULE_VERSION)
    versionProblems.push('ruleVersion');
  if (freeze.inputConstruction.context.fetchPolicyVersion !== FETCH_POLICY_VERSION)
    versionProblems.push('fetchPolicyVersion');
  if (freeze.inputConstruction.context.assemblyVersion !== ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION)
    versionProblems.push('assemblyVersion');
  if (freeze.classifier.assemblyVersion !== ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION)
    versionProblems.push('classifier.assemblyVersion');
  if (freeze.classifier.outputSchemaVersion !== ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION)
    versionProblems.push('outputSchemaVersion');
  if (versionProblems.length > 0) {
    refuseReadiness(
      'PRODUCTION_VERSION_CONSTANTS',
      `differ from the freeze: ${versionProblems.join(', ')}.`,
    );
  }
  const mismatches = f0oBatchMismatches(freeze, batches);
  if (mismatches.length > 0) {
    refuseReadiness(
      'FROZEN_BATCHES_RECONSTRUCTED',
      `differ from the freeze: ${mismatches.join(', ')}.`,
    );
  }
  const v3CopyProblems = verifyV3ComparatorCopiedFromF0E(freeze, f0eLoaded.freeze);
  if (v3CopyProblems.length > 0) {
    refuseReadiness(
      'ATTEMPT2_COMPARATOR_COPIED_FROM_F0E',
      `differ from F0E's own V3 identities: ${v3CopyProblems.join(', ')}.`,
    );
  }
  const v4CopyProblems = verifyV4ComparatorCopiedFromF0I(freeze, f0iLoaded.freeze);
  if (v4CopyProblems.length > 0) {
    refuseReadiness(
      'ATTEMPT3_COMPARATOR_COPIED_FROM_F0I',
      `differ from F0I's own V4 identities: ${v4CopyProblems.join(', ')}.`,
    );
  }
  readiness.push({
    id: 'FROZEN_BATCHES_RECONSTRUCTED',
    ok: true,
    detail: `${batches.length} batches, ${corpus.rows.length} DEVELOPMENT rows; 12 V5 identities, 24 attempt-1 comparator identities recomputed, 12 attempt-2 comparator identities cross-checked against F0E, 12 attempt-3 comparator identities cross-checked against F0I`,
  });

  // 5. The plan: order, count, one variant, the pinned F0O plan SHA-256.
  const plan = buildF0OExecutionPlan(freeze, loaded.rawSha256);
  if (!f0oPlanOrderIsFrozen(plan)) {
    refuseReadiness(
      'PLAN_ORDER_FROZEN',
      'the plan is not the one V5 variant over ordinals 1..12 in order.',
    );
  }
  const rebuiltPlanSha256 = f0oPlanSha256(plan);
  if (rebuiltPlanSha256 !== PROPOSED_F0O_PLAN_SHA256) {
    refuseReadiness(
      'PLAN_SHA256_PINNED',
      `rebuilt plan SHA-256 ${rebuiltPlanSha256} is not the pinned F0O plan ${PROPOSED_F0O_PLAN_SHA256}.`,
    );
  }
  const scheduledVariants = [...new Set(plan.evaluations.map((e) => e.variantName))];
  if (scheduledVariants.length !== 1 || scheduledVariants[0] !== ATTEMPT_4_VARIANT_NAME) {
    refuseReadiness('PLAN_ONE_VARIANT', `scheduled variants: ${scheduledVariants.join(', ')}.`);
  }
  if (plan.evaluations.some((e) => e.variantGitCommit !== F0O_VARIANT.gitCommit)) {
    refuseReadiness('PLAN_RUNTIME_COMMIT', 'an evaluation names a runtime commit other than V5.');
  }
  readiness.push({
    id: 'PLAN_SHA256_PINNED',
    ok: true,
    detail: `${rebuiltPlanSha256}; ${plan.plannedLogicalEvaluations} logical evaluations of ${ATTEMPT_4_VARIANT_NAME} at ${F0O_VARIANT.gitCommit}, ordinals 1..12; PROMPT_V1_CANONICAL, PROMPT_V2_CANONICAL, PROMPT_V3_CANONICAL and PROMPT_V4_CANONICAL scheduled 0 times`,
  });

  // 6. The mechanical call ceiling, recomputed from the batch structure.
  const documents = batches.reduce((total, b) => total + b.documents.length, 0);
  const perEvaluation = batches.map((b) => deriveCallCeiling(b.documents.length));
  const totals = {
    logicalEvaluations: batches.length,
    originalRequests: batches.length,
    documents,
    maxRepairRequests: perEvaluation.reduce((t, c) => t + c.maxRepairRequests, 0),
    maxProviderRequests: perEvaluation.reduce((t, c) => t + c.maxProviderRequests, 0),
    maxAdapterAttempts: perEvaluation.reduce((t, c) => t + c.maxAdapterAttempts, 0),
  };
  if (canonicalStringify(totals) !== canonicalStringify(freeze.callCeiling.totals)) {
    refuseReadiness(
      'CALL_CEILING',
      `recomputed ${JSON.stringify(totals)} differs from the freeze.`,
    );
  }
  readiness.push({
    id: 'CALL_CEILING',
    ok: true,
    detail: `${totals.originalRequests} original + at most ${totals.maxRepairRequests} repair = at most ${totals.maxProviderRequests} provider requests; at most ${totals.maxAdapterAttempts} adapter attempts`,
  });

  // 7. HOLDOUT boundary.
  const violations = holdoutBoundaryViolationsF0O(freeze, plan);
  if (violations.length > 0) {
    refuseReadiness('HOLDOUT_BOUNDARY', `the plan carries ${violations.join(', ')}.`);
  }
  readiness.push({
    id: 'HOLDOUT_BOUNDARY',
    ok: true,
    detail: 'no never-read path and no HOLDOUT token in the canonical plan bytes',
  });

  // 8. The V5 root, if supplied (real Git and filesystem probes; loads the root's SDK-free modules only).
  let rootVerification: VariantRootVerification | null = null;
  if (options.v5Root !== null) {
    rootVerification = await verifyV5Root(
      options.v5Root,
      freeze,
      io.rootProbes ?? createRealVariantRootProbes(),
    );
  }
  const rootOk = rootVerification === null || rootVerification.ok;

  // 9. The attempt-1 comparator, if supplied — READ-ONLY.
  let comparator1: ComparatorVerification | null = null;
  if (options.attempt1Root !== null) {
    comparator1 = verifyAttempt1ComparatorF0O(RUNNER_REPO_ROOT, freeze, options.attempt1Root);
  }
  const comparator1Ok = comparator1 === null || comparator1.ok;

  // 10. The attempt-2 comparator, if supplied — READ-ONLY.
  let comparator2: ComparatorVerification | null = null;
  if (options.attempt2Root !== null) {
    comparator2 = verifyAttempt2ComparatorF0O(RUNNER_REPO_ROOT, freeze, options.attempt2Root);
  }
  const comparator2Ok = comparator2 === null || comparator2.ok;

  // 11. The attempt-3 comparator, if supplied — READ-ONLY.
  let comparator3: ComparatorVerification | null = null;
  if (options.attempt3Root !== null) {
    comparator3 = verifyAttempt3ComparatorF0O(RUNNER_REPO_ROOT, freeze, options.attempt3Root);
  }
  const comparator3Ok = comparator3 === null || comparator3.ok;

  // Plan-only VERIFICATION-ONLY evaluation of a candidate authorisation
  // (refused with --execute above). Nothing is created or consumed.
  const candidate =
    options.verifyAuthorisationCandidate === null
      ? null
      : verifyCandidateAuthorisation(options, io);
  const candidateOk = candidate === null || candidate.structurallyAcceptable;

  const summary = {
    mode: options.execute ? 'EXECUTE_REQUESTED' : 'PLAN_ONLY',
    attemptNo: ATTEMPT_4_NO,
    freezeRevision: freeze.freezeRevision,
    freezeConfigRawSha256: loaded.rawSha256,
    freezeRawBytes: loaded.rawBytes,
    freezeVersion: freeze.version,
    corpus: {
      rawSha256: corpus.corpusRawSha256,
      manifestRawSha256: corpus.manifestRawSha256,
      contentSha256: corpus.contentSha256,
      rows: corpus.rows.length,
    },
    planSha256: rebuiltPlanSha256,
    plannedLogicalEvaluations: plan.plannedLogicalEvaluations,
    callCeilingTotals: totals,
    readiness,
    v5Root:
      rootVerification === null
        ? null
        : {
            root: rootVerification.root,
            ok: rootVerification.ok,
            checks: rootVerification.checks,
            claudeCodeExecutable: rootVerification.claudeCodeExecutable,
          },
    attempt1Comparator: comparator1,
    attempt2Comparator: comparator2,
    attempt3Comparator: comparator3,
    authorisationCandidate: candidate,
    executionAuthorisation:
      candidate === null
        ? 'NOT_EVALUATED_IN_PLAN_ONLY_MODE'
        : 'CANDIDATE_VERIFIED_ONLY_NOTHING_ISSUED_NOTHING_CONSUMED',
  };

  if (!options.execute) {
    io.stdout(
      options.json
        ? `${JSON.stringify({ ...summary, plan }, null, 2)}\n`
        : renderPlanText(summary, plan),
    );
    return rootOk && comparator1Ok && comparator2Ok && comparator3Ok && candidateOk ? 0 : 1;
  }

  // EXECUTION PATH — every gate, in order, before the first child.
  const missing: string[] = [];
  if (options.v5Root === null) missing.push('--v5-root');
  if (options.outputRoot === null) missing.push('--output-root');
  if (options.attemptNo === null) missing.push('--attempt-no');
  if (options.classifierConfigDir === null) missing.push('--classifier-config-dir');
  if (options.authorisation === null) missing.push('--authorisation');
  if (missing.length > 0) {
    io.stderr(`REFUSED: attempt-4 execution requires ${missing.join(', ')}.\n`);
    return 2;
  }
  if (options.attemptNo !== ATTEMPT_4_NO) {
    io.stderr(
      `REFUSED: the F0O freeze configures attempt ${ATTEMPT_4_NO}; --attempt-no ${options.attemptNo} is not it.\n`,
    );
    return 2;
  }
  if (rootVerification === null || !rootVerification.ok) {
    io.stderr(
      `REFUSED: the V5 root failed verification.\n${JSON.stringify(summary.v5Root, null, 2)}\n`,
    );
    return 2;
  }
  if (!comparator1Ok) {
    io.stderr(
      `REFUSED: the attempt-1 comparator root failed read-only verification.\n${JSON.stringify(comparator1, null, 2)}\n`,
    );
    return 2;
  }
  if (!comparator2Ok) {
    io.stderr(
      `REFUSED: the attempt-2 comparator root failed read-only verification.\n${JSON.stringify(comparator2, null, 2)}\n`,
    );
    return 2;
  }
  if (!comparator3Ok) {
    io.stderr(
      `REFUSED: the attempt-3 comparator root failed read-only verification.\n${JSON.stringify(comparator3, null, 2)}\n`,
    );
    return 2;
  }
  if (
    options.attempt1Root === null ||
    options.attempt2Root === null ||
    options.attempt3Root === null
  ) {
    io.stderr(
      'REFUSED: attempt-4 execution requires --attempt1-root, --attempt2-root AND --attempt3-root as read-only comparators.\n',
    );
    return 2;
  }
  const runPlatform = freeze.classifier.claudeCodeExecutable.runPlatform;
  const executable = rootVerification.claudeCodeExecutable;
  if (executable === null || !executable.onFrozenRunPlatform) {
    io.stderr(
      `REFUSED: execution is frozen to ${runPlatform.platformKey}; this process is ` +
        `${process.platform}-${process.arch}, where the SDK-bundled binary identity is not pinned.\n`,
    );
    return 2;
  }
  const forbiddenContainers = [
    RUNNER_REPO_ROOT,
    options.v5Root!,
    options.attempt1Root,
    options.attempt2Root,
    options.attempt3Root,
    ...listWorktrees(RUNNER_REPO_ROOT),
  ];
  const outputRootDecision = validateOutputRoot(options.outputRoot!, forbiddenContainers, {
    realpath: (path) => realpathSync.native(path),
    isDirectory: (path) => {
      try {
        return lstatSync(path).isDirectory();
      } catch {
        return false;
      }
    },
  });
  if (!outputRootDecision.ok) {
    io.stderr(`REFUSED: output root ${outputRootDecision.refusal}: ${outputRootDecision.detail}\n`);
    return 2;
  }
  // Attempt-4 evidence starts in a FRESH namespace. Attempt-1/2/3 evidence
  // are read-only comparator input and are never inside it; nothing
  // pre-existing may be inside it either — a fresh Attempt-4 output root is
  // required, and any unexplained content fails closed.
  const existing = readdirSync(outputRootDecision.outputRoot);
  if (existing.length > 0) {
    io.stderr(
      `REFUSED: output root ATTEMPT4_OUTPUT_ROOT_NOT_EMPTY: the attempt-4 output root must be an empty directory; it holds ${existing.length} entr${existing.length === 1 ? 'y' : 'ies'} (${existing.slice(0, 5).join(', ')}).\n`,
    );
    return 2;
  }
  const lock = evaluateAttempt4ExecutionLock({
    executeFlag: options.execute,
    authorisationPath: options.authorisation,
    expected: { outputRoot: outputRootDecision.outputRoot, attemptNo: options.attemptNo! },
    readFile: (path) => readFileSync(path),
    sha256: sha256Hex,
    alreadyConsumed: (sha) => isAuthorisationConsumed(outputRootDecision.outputRoot, sha),
    nowUtc: io.nowUtc,
  });
  if (!lock.granted) {
    io.stderr(`REFUSED: attempt-4 execution lock ${lock.refusal}: ${lock.detail}\n`);
    return 2;
  }
  const result = await runExperiment({
    plan,
    freezePath,
    outputRoot: outputRootDecision.outputRoot,
    attemptNo: options.attemptNo!,
    authorisation: lock.authorisation,
    authorisationSha256: lock.authorisationSha256,
    variantRoots: { [ATTEMPT_4_VARIANT_NAME]: options.v5Root! },
    classifierConfigDir: options.classifierConfigDir!,
    parentEnv: io.env,
    platform: terminationPlatformOf(process.platform),
    launcher: io.launcher,
    clock: { nowUtc: io.nowUtc },
  });
  io.stdout(
    `${JSON.stringify({ ...summary, executionAuthorisation: 'GRANTED_AND_CONSUMED', experiment: result }, null, 2)}\n`,
  );
  return result.status === 'COMPLETED_ALL_PLANNED' ? 0 : 3;
}

export interface AuthorisationCandidateVerification {
  readonly path: string;
  readonly sha256: string | null;
  readonly byteLength: number | null;
  readonly outputRoot: string | null;
  readonly structurallyAcceptable: boolean;
  readonly decision: string;
  readonly detail: string;
  readonly consumptionMarkerExists: boolean;
  readonly issued: false;
  readonly consumed: false;
}

/**
 * Verifies a CANDIDATE authorisation exactly as the execution path would,
 * and reports. Requires `--output-root` and `--attempt-no` so the root and
 * attempt bindings are checked against real values; the output root is
 * validated read-only with the same rules and the same emptiness
 * requirement as execution. Never writes, never launches, never consumes.
 */
function verifyCandidateAuthorisation(
  options: F0OCliOptions,
  io: F0OCliIo,
): AuthorisationCandidateVerification {
  const path = options.verifyAuthorisationCandidate!;
  const report = (
    fields: Partial<AuthorisationCandidateVerification> & {
      readonly decision: string;
      readonly detail: string;
    },
  ): AuthorisationCandidateVerification => ({
    path,
    sha256: null,
    byteLength: null,
    outputRoot: null,
    structurallyAcceptable: false,
    consumptionMarkerExists: false,
    ...fields,
    issued: false,
    consumed: false,
  });
  let sha256: string | null = null;
  let byteLength: number | null = null;
  try {
    const bytes = readFileSync(path);
    sha256 = sha256Hex(bytes);
    byteLength = bytes.byteLength;
  } catch {
    // The lock reports the unreadable candidate itself; nothing is hashed.
  }
  if (options.outputRoot === null || options.attemptNo === null) {
    return report({
      sha256,
      byteLength,
      decision: 'CANDIDATE_VERIFICATION_INCOMPLETE',
      detail:
        'candidate verification requires --output-root and --attempt-no so the root and attempt bindings are checked against real values.',
    });
  }
  if (options.attemptNo !== ATTEMPT_4_NO) {
    return report({
      sha256,
      byteLength,
      decision: 'CANDIDATE_VERIFICATION_INCOMPLETE',
      detail: `the F0O freeze configures attempt ${ATTEMPT_4_NO}; --attempt-no ${options.attemptNo} is not it.`,
    });
  }
  const forbiddenContainers = [
    RUNNER_REPO_ROOT,
    ...(options.v5Root === null ? [] : [options.v5Root]),
    ...(options.attempt1Root === null ? [] : [options.attempt1Root]),
    ...(options.attempt2Root === null ? [] : [options.attempt2Root]),
    ...(options.attempt3Root === null ? [] : [options.attempt3Root]),
    ...listWorktrees(RUNNER_REPO_ROOT),
  ];
  const outputRootDecision = validateOutputRoot(options.outputRoot, forbiddenContainers, {
    realpath: (candidatePath) => realpathSync.native(candidatePath),
    isDirectory: (candidatePath) => {
      try {
        return lstatSync(candidatePath).isDirectory();
      } catch {
        return false;
      }
    },
  });
  if (!outputRootDecision.ok) {
    return report({
      sha256,
      byteLength,
      decision: `OUTPUT_ROOT_${outputRootDecision.refusal}`,
      detail: outputRootDecision.detail,
    });
  }
  const existing = readdirSync(outputRootDecision.outputRoot);
  if (existing.length > 0) {
    return report({
      sha256,
      byteLength,
      outputRoot: outputRootDecision.outputRoot,
      decision: 'ATTEMPT4_OUTPUT_ROOT_NOT_EMPTY',
      detail: `the attempt-4 output root must be an empty directory; it holds ${existing.length} entr${existing.length === 1 ? 'y' : 'ies'}.`,
    });
  }
  const consumptionMarkerExists =
    sha256 !== null && isAuthorisationConsumed(outputRootDecision.outputRoot, sha256);
  const lock = verifyAttempt4AuthorisationCandidate({
    authorisationPath: path,
    expected: { outputRoot: outputRootDecision.outputRoot, attemptNo: options.attemptNo },
    readFile: (candidatePath) => readFileSync(candidatePath),
    sha256: sha256Hex,
    alreadyConsumed: (candidateSha) =>
      isAuthorisationConsumed(outputRootDecision.outputRoot, candidateSha),
    nowUtc: io.nowUtc,
  });
  if (!lock.granted) {
    return report({
      sha256,
      byteLength,
      outputRoot: outputRootDecision.outputRoot,
      consumptionMarkerExists,
      decision: lock.refusal,
      detail: lock.detail,
    });
  }
  return report({
    sha256,
    byteLength,
    outputRoot: outputRootDecision.outputRoot,
    consumptionMarkerExists,
    structurallyAcceptable: true,
    decision: 'STRUCTURALLY_ACCEPTABLE',
    detail:
      `the candidate would satisfy every attempt-4 lock check for output root ${outputRootDecision.outputRoot}, attempt ${options.attemptNo}, at the clock this invocation observed. ` +
      'NOTHING WAS ISSUED, GRANTED OR CONSUMED: this invocation has no execution branch.',
  });
}

function renderPlanText(summary: Record<string, unknown>, plan: F0OExecutionPlan): string {
  const lines: string[] = [
    'PHASE 2B-2D2C attempt-4 runner — PLAN / READINESS ONLY (no provider, auth, database or network call was made; nothing was written)',
    `freeze ${String(summary['freezeVersion'])} (${String(summary['freezeRevision'])}) raw sha256 ${String(summary['freezeConfigRawSha256'])} (${String(summary['freezeRawBytes'])} bytes)`,
    `plan sha256 ${String(summary['planSha256'])}; ${plan.plannedLogicalEvaluations} logical evaluations of ${ATTEMPT_4_VARIANT_NAME} at ${F0O_VARIANT.gitCommit}, attempt ${plan.attemptNo}, concurrency 1`,
    `requested model ${plan.requestedModelId}; runConfig ${JSON.stringify(plan.runConfig)}; repair policy ${JSON.stringify(plan.repairPolicy)}`,
    `tier1 ${plan.liveness.tier1SoftDeadlineMs}/${plan.liveness.tier1GraceMs}/${plan.liveness.tier1TotalBudgetMs} ms; tier2 ${plan.liveness.tier2WatchdogMs}/${plan.liveness.tier2GraceMs} ms`,
    `call ceiling ${JSON.stringify(summary['callCeilingTotals'])}`,
    '',
    'seq  variant               ord  organisation                               docs  maxReq  finalInputSha256',
  ];
  for (const e of plan.evaluations) {
    lines.push(
      `${String(e.sequence).padStart(3)}  ${e.variantName.padEnd(21)} ${String(e.logicalBatchOrdinal).padStart(3)}  ${e.echeRowKey.padEnd(42)} ${String(e.orderedDocIndices.length).padStart(4)}  ${String(e.callCeiling.maxProviderRequests).padStart(6)}  ${e.finalInputSha256}`,
    );
  }
  lines.push('');
  for (const check of summary['readiness'] as readonly ReadinessCheck[]) {
    lines.push(`  ${check.ok ? 'ok ' : 'FAIL'} ${check.id}: ${check.detail}`);
  }
  const root = summary['v5Root'] as {
    root: string;
    ok: boolean;
    checks: readonly { id: string; ok: boolean; detail: string }[];
  } | null;
  if (root !== null) {
    lines.push(
      '',
      `${ATTEMPT_4_VARIANT_NAME} root ${root.root}: ${root.ok ? 'VERIFIED' : 'REFUSED'}`,
    );
    for (const check of root.checks)
      lines.push(`  ${check.ok ? 'ok ' : 'FAIL'} ${check.id}: ${check.detail}`);
  }
  for (const key of ['attempt1Comparator', 'attempt2Comparator', 'attempt3Comparator'] as const) {
    const comparator = summary[key] as ComparatorVerification | null;
    if (comparator !== null) {
      lines.push(
        '',
        `${key} ${comparator.root}: ${comparator.ok ? 'VERIFIED READ-ONLY' : 'REFUSED'} — ${comparator.detail}`,
      );
    }
  }
  const candidate = summary['authorisationCandidate'] as AuthorisationCandidateVerification | null;
  if (candidate !== null) {
    lines.push(
      '',
      `authorisation CANDIDATE ${candidate.path}: ${candidate.decision}`,
      `  sha256 ${candidate.sha256 ?? '<unreadable>'}; ${candidate.byteLength ?? '?'} bytes; output root ${candidate.outputRoot ?? '<not validated>'}; consumption marker ${candidate.consumptionMarkerExists ? 'EXISTS' : 'absent'}`,
      `  ${candidate.detail}`,
      '  issued: false; consumed: false — verification only.',
    );
  }
  lines.push(
    '',
    'Execution requires --execute AND --authorisation <absolute path> naming a NEW attempt-4 owner authorisation, plus --attempt1-root, --attempt2-root AND --attempt3-root as read-only comparators; nothing less enables anything. This invocation authorised nothing.',
  );
  return `${lines.join('\n')}\n`;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runF0OCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: { ...process.env },
    nowUtc: () => new Date(),
    launcher: createF0OProductionLauncher(),
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

// Referenced only to keep the imports honest for readers checking the
// authorisation-version refusal list this file documents in its header.
export {
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
  ATTEMPT4_AUTHORISATION_VERSION,
};

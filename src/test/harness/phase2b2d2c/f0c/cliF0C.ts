/**
 * PHASE 2B-2D2C-F0D — THE ATTEMPT-2 DEFAULT-SAFE CLI.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0c/cliF0C.ts [options]
 *
 * DEFAULT = PLAN / READINESS ONLY. With no `--execute`, the CLI loads and
 * hash-verifies the CURRENT attempt-2 freeze (F0E, PROPOSED, superseding
 * F0C), verifies the superseded F0C bytes and owner records by exact hash,
 * reports the F0E approval status, verifies the F0B predecessor bytes,
 * reads the DEVELOPMENT canonical corpus and manifest, reconstructs the
 * twelve frozen batches through this worktree's production algorithms,
 * verifies every serialized input, every assembly identity, every V3 final
 * identity AND every attempt-1 comparator identity the freeze carries,
 * rebuilds the attempt-2 plan, verifies its order and its SHA-256 against
 * the approved value, recomputes the mechanical call ceiling, checks the
 * HOLDOUT boundary, verifies the V3 root if one is supplied, and verifies
 * the attempt-1 comparator root READ-ONLY if one is supplied. It makes zero
 * provider, authentication, database and network calls and mutates no
 * directory. Nothing SDK-bearing is imported on this path.
 *
 * EXECUTION requires the attempt-2 double lock (`--execute` AND
 * `--authorisation <absolute path>` naming a NEW owner authorisation of the
 * attempt-2 shape), the V3 root, an EMPTY output root outside every
 * repository worktree and outside the attempt-1 root, `--attempt-no 2` and
 * the classifier configuration directory. Every readiness check above runs
 * FIRST; only when all of them and the lock pass does the coordinator fork
 * the first child. Attempt-1 evidence is never written into, and never
 * read as anything but a comparator.
 *
 * This file lives under `src/test/harness/` for the same reason the
 * attempt-1 CLI does: the firewall forbids any file outside `src/test/` from
 * importing the Tier-2 harness. It never imports the execution-only
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
import { loadScoringSources } from '../scoring/sources.js';
import { createRealVariantRootProbes } from '../variantRootProbes.js';
import type { VariantRootProbes, VariantRootVerification } from '../variantRoot.js';
import { evaluateAttempt2ExecutionLock } from './authorisationF0C.js';
import {
  APPROVED_F0C_FREEZE_RAW_SHA256,
  APPROVED_F0C_PLAN_SHA256,
  F0C_APPROVAL_RECORD_PATH,
  F0C_APPROVAL_RECORD_RAW_SHA256,
  F0C_FREEZE_PATH,
  F0C_RATIFICATION_RECORD_PATH,
  F0C_RATIFICATION_RECORD_RAW_SHA256,
} from './freezeF0C.js';
import {
  ATTEMPT_2_NO,
  ATTEMPT_2_VARIANT_NAME,
  buildF0EExecutionPlan,
  deriveCallCeiling,
  F0CFreezeError,
  F0E_APPROVAL_RECORD_PATH,
  F0E_APPROVAL_RECORD_RAW_SHA256,
  F0E_FREEZE_PATH,
  F0E_VARIANT,
  f0ePlanOrderIsFrozen,
  f0ePlanSha256,
  loadF0EFreezeFromBytes,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  PROPOSED_F0E_PLAN_SHA256,
  type Attempt2ExecutionPlan,
  type Attempt2Freeze,
} from './freezeF0E.js';
import { f0cBatchMismatches, holdoutBoundaryViolations } from './planVerification.js';
import { verifyV3Root } from './variantRootF0C.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** This worktree's root: the runner's own repository. */
export const RUNNER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');
/** The SAME Tier-2 child entry attempt 1 used; it resolves the freeze family by hash. */
export const CHILD_ENTRY_PATH = join(HERE, '..', 'childEntry.mjs');

export interface F0CCliOptions {
  readonly execute: boolean;
  readonly authorisation: string | null;
  readonly outputRoot: string | null;
  readonly attemptNo: number | null;
  readonly v3Root: string | null;
  /** The preserved attempt-1 root, verified READ-ONLY as the comparator; never written. */
  readonly attempt1Root: string | null;
  readonly classifierConfigDir: string | null;
  readonly json: boolean;
}

const FLAGS_WITH_VALUE = new Set([
  '--authorisation',
  '--output-root',
  '--attempt-no',
  '--v3-root',
  '--attempt1-root',
  '--classifier-config-dir',
]);

/** Closed argument parser: an unknown flag is an error, never ignored. There is no `--v1-root`, `--v2-root` or `--all`. */
export function parseF0CCliArgs(argv: readonly string[]): F0CCliOptions {
  const options = {
    execute: false,
    authorisation: null as string | null,
    outputRoot: null as string | null,
    attemptNo: null as number | null,
    v3Root: null as string | null,
    attempt1Root: null as string | null,
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
      else if (arg === '--v3-root') options.v3Root = value;
      else if (arg === '--attempt1-root') options.attempt1Root = value;
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

export interface F0CCliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nowUtc: () => Date;
  readonly launcher: ChildLauncher;
  /** Test seam: root probes over a synthetic root. Production passes nothing and gets the real Git and filesystem probes. */
  readonly rootProbes?: VariantRootProbes;
}

export function createF0CProductionLauncher(): ChildLauncher {
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
  throw new F0CFreezeError('CORPUS_CONFIG_OR_HASH_DRIFT', `${id}: ${detail}`);
}

export type F0EApprovalStatus = 'PENDING_OWNER_APPROVAL' | 'RECORDED_AND_PINNED';

/**
 * The F0E owner freeze-approval record: PENDING until the owner records it
 * and its hash is pinned in `freezeF0E.ts` by a reviewed edit. Plan-only
 * mode reports the status; the execution path REFUSES while pending.
 */
export function f0eApprovalStatus(repoRoot: string): {
  readonly status: F0EApprovalStatus;
  readonly detail: string;
} {
  const path = join(repoRoot, F0E_APPROVAL_RECORD_PATH);
  if (F0E_APPROVAL_RECORD_RAW_SHA256 === null) {
    return {
      status: 'PENDING_OWNER_APPROVAL',
      detail: `${F0E_APPROVAL_RECORD_PATH} is not recorded and no approval hash is pinned; the F0E freeze is PROPOSED and authorises nothing.${existsSync(path) ? ' (A file exists at that path but is NOT pinned; it is not trusted.)' : ''}`,
    };
  }
  const bytes = readFileSync(path);
  const actual = sha256Hex(bytes);
  if (actual !== F0E_APPROVAL_RECORD_RAW_SHA256) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RECORD_F0E',
      `${F0E_APPROVAL_RECORD_PATH} hashes to ${actual}; the pinned approval record is ${F0E_APPROVAL_RECORD_RAW_SHA256}.`,
    );
  }
  // The record must name EXACTLY the frozen bytes, the derived plan and the
  // superseded F0C, and must claim to authorise nothing.
  const record = JSON.parse(bytes.toString('utf8')) as {
    recordKind?: unknown;
    approvedFreeze?: { file?: unknown; rawSha256?: unknown; derivedAttempt2PlanSha256?: unknown };
    supersedes?: { rawSha256?: unknown };
    thisRecordAuthorises?: unknown;
  };
  if (
    record.recordKind !== 'OWNER_FREEZE_APPROVAL' ||
    record.approvedFreeze?.file !== F0E_FREEZE_PATH ||
    record.approvedFreeze?.rawSha256 !== PROPOSED_F0E_FREEZE_RAW_SHA256 ||
    record.approvedFreeze?.derivedAttempt2PlanSha256 !== PROPOSED_F0E_PLAN_SHA256 ||
    record.supersedes?.rawSha256 !== APPROVED_F0C_FREEZE_RAW_SHA256 ||
    !Array.isArray(record.thisRecordAuthorises) ||
    record.thisRecordAuthorises.length !== 0
  ) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RECORD_F0E',
      'the F0E approval record does not name exactly the frozen bytes, plan and superseded F0C, or claims to authorise something.',
    );
  }
  return {
    status: 'RECORDED_AND_PINNED',
    detail: `${actual} (names the frozen bytes, plan and superseded F0C; authorises nothing)`,
  };
}

/**
 * The SUPERSEDED F0C freeze and its owner records, by exact hash — kept
 * verifiable as immutable historical evidence. They authorise nothing.
 */
export function verifyOwnerApprovalRecords(
  repoRoot: string,
  supersededFreezeRawSha256: string,
): readonly ReadinessCheck[] {
  const f0cSha256 = sha256Hex(readFileSync(join(repoRoot, F0C_FREEZE_PATH)));
  if (f0cSha256 !== APPROVED_F0C_FREEZE_RAW_SHA256 || f0cSha256 !== supersededFreezeRawSha256) {
    refuseReadiness(
      'SUPERSEDED_F0C_BYTE_IDENTICAL',
      `${F0C_FREEZE_PATH} hashes to ${f0cSha256}; the superseded F0C bytes are ${APPROVED_F0C_FREEZE_RAW_SHA256}.`,
    );
  }
  const freezeRawSha256 = f0cSha256;
  const approvalBytes = readFileSync(join(repoRoot, F0C_APPROVAL_RECORD_PATH));
  const approvalSha = sha256Hex(approvalBytes);
  if (approvalSha !== F0C_APPROVAL_RECORD_RAW_SHA256) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RECORD',
      `${F0C_APPROVAL_RECORD_PATH} hashes to ${approvalSha}; the pinned approval record is ${F0C_APPROVAL_RECORD_RAW_SHA256}.`,
    );
  }
  const approval = JSON.parse(approvalBytes.toString('utf8')) as {
    recordKind?: unknown;
    approvedFreeze?: { rawSha256?: unknown; derivedAttempt2PlanSha256?: unknown };
    thisRecordAuthorises?: unknown;
  };
  if (
    approval.recordKind !== 'OWNER_FREEZE_APPROVAL' ||
    approval.approvedFreeze?.rawSha256 !== freezeRawSha256 ||
    approval.approvedFreeze?.derivedAttempt2PlanSha256 !== APPROVED_F0C_PLAN_SHA256 ||
    !Array.isArray(approval.thisRecordAuthorises) ||
    approval.thisRecordAuthorises.length !== 0
  ) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RECORD',
      'the approval record does not name exactly the frozen bytes and plan, or claims to authorise something.',
    );
  }
  const ratificationBytes = readFileSync(join(repoRoot, F0C_RATIFICATION_RECORD_PATH));
  const ratificationSha = sha256Hex(ratificationBytes);
  if (ratificationSha !== F0C_RATIFICATION_RECORD_RAW_SHA256) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RATIFICATION',
      `${F0C_RATIFICATION_RECORD_PATH} hashes to ${ratificationSha}; the pinned ratification is ${F0C_RATIFICATION_RECORD_RAW_SHA256}.`,
    );
  }
  const ratification = JSON.parse(ratificationBytes.toString('utf8')) as {
    recordKind?: unknown;
    ratifiedApprovalRecord?: { rawSha256?: unknown };
    approvedFreeze?: { rawSha256?: unknown; derivedAttempt2PlanSha256?: unknown };
    markerCorrection?: { canonicalMarker?: unknown };
    thisRecordAuthorises?: unknown;
  };
  if (
    ratification.recordKind !== 'OWNER_FREEZE_APPROVAL_RATIFICATION' ||
    ratification.ratifiedApprovalRecord?.rawSha256 !== approvalSha ||
    ratification.approvedFreeze?.rawSha256 !== freezeRawSha256 ||
    ratification.approvedFreeze?.derivedAttempt2PlanSha256 !== APPROVED_F0C_PLAN_SHA256 ||
    ratification.markerCorrection?.canonicalMarker !== 'APPROVE_F0C_FREEZE' ||
    !Array.isArray(ratification.thisRecordAuthorises) ||
    ratification.thisRecordAuthorises.length !== 0
  ) {
    refuseReadiness(
      'OWNER_FREEZE_APPROVAL_RATIFICATION',
      'the ratification does not reference the approval record and the frozen bytes exactly, or claims to authorise something.',
    );
  }
  return [
    {
      id: 'SUPERSEDED_F0C_BYTE_IDENTICAL',
      ok: true,
      detail: `${f0cSha256} (historical; authorises nothing)`,
    },
    { id: 'OWNER_FREEZE_APPROVAL_RECORD_F0C', ok: true, detail: `${approvalSha} (historical)` },
    {
      id: 'OWNER_FREEZE_APPROVAL_RATIFICATION_F0C',
      ok: true,
      detail: `${ratificationSha} (historical)`,
    },
  ];
}

export interface Attempt1ComparatorVerification {
  readonly root: string;
  readonly ok: boolean;
  readonly artifactInventorySha256: string;
  readonly artifactsVerified: number;
  readonly planSha256: string;
  readonly consumptionMarkerSha256: string;
  readonly containsNoAttempt2Namespace: boolean;
  readonly detail: string;
}

/**
 * READ-ONLY: the preserved attempt-1 root is loaded through the F4 scorer's
 * own verifying loader (every artifact hash-verified, nothing written) and
 * its primary inventory must equal the value the F0C freeze pins as the
 * comparator. It must also hold no attempt-2 namespace of any kind.
 */
export function verifyAttempt1Comparator(
  repoRoot: string,
  freeze: Attempt2Freeze,
  attempt1Root: string,
): Attempt1ComparatorVerification {
  const comparator = freeze.scoring.comparatorPolicy.attempt1;
  const sources = loadScoringSources(repoRoot, attempt1Root);
  const evaluationsDir = join(attempt1Root, 'evaluations');
  const variantDirs = readdirSync(evaluationsDir).sort();
  const experimentDirs = readdirSync(join(attempt1Root, 'experiments')).sort();
  const containsNoAttempt2Namespace =
    !variantDirs.includes(ATTEMPT_2_VARIANT_NAME) &&
    !experimentDirs.includes(`attempt-${ATTEMPT_2_NO}`) &&
    !variantDirs.some((variant) =>
      readdirSync(join(evaluationsDir, variant)).some((batch) =>
        readdirSync(join(evaluationsDir, variant, batch)).includes(`attempt-${ATTEMPT_2_NO}`),
      ),
    );
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
  if (sources.consumptionMarkerSha256 === undefined) problems.push('comparator marker');
  if (!containsNoAttempt2Namespace) problems.push('an attempt-2 namespace exists inside attempt 1');
  return {
    root: attempt1Root,
    ok: problems.length === 0,
    artifactInventorySha256: sources.artifactInventorySha256,
    artifactsVerified: sources.artifactsVerified,
    planSha256: sources.planSha256,
    consumptionMarkerSha256: sources.consumptionMarkerSha256,
    containsNoAttempt2Namespace,
    detail:
      problems.length === 0
        ? `${sources.artifactsVerified} artifacts hash-verified read-only; inventory equals the frozen comparator`
        : problems.join('; '),
  };
}

// ---------------------------------------------------------------------------
// The CLI.
// ---------------------------------------------------------------------------

/** Runs the attempt-2 CLI. Returns the process exit code; never calls `process.exit` itself. */
export async function runF0CCli(argv: readonly string[], io: F0CCliIo): Promise<number> {
  const options = parseF0CCliArgs(argv);
  const readiness: ReadinessCheck[] = [];

  // 1. The CURRENT attempt-2 freeze (F0E, PROPOSED), by hash, then shape,
  //    then production agreement — including that its runtime commit is the
  //    corrected V3B and that it supersedes F0C by exact hash.
  const freezePath = join(RUNNER_REPO_ROOT, F0E_FREEZE_PATH);
  const loaded = loadF0EFreezeFromBytes(readFileSync(freezePath));
  if (loaded.rawSha256 !== PROPOSED_F0E_FREEZE_RAW_SHA256) {
    refuseReadiness(
      'PROPOSED_F0E_FREEZE',
      `raw SHA-256 ${loaded.rawSha256} is not the pinned value.`,
    );
  }
  readiness.push({
    id: 'PROPOSED_F0E_FREEZE',
    ok: true,
    detail: `${loaded.rawSha256} (${loaded.rawBytes} bytes); supersedes F0C ${loaded.freeze.supersedes?.rawSha256 ?? '?'}; runtime ${F0E_VARIANT.gitCommit}`,
  });
  const { freeze } = loaded;

  // 2. The superseded F0C bytes and their owner records (historical, by exact
  //    hash), then the F0E approval STATUS (pending until recorded and pinned).
  readiness.push(
    ...verifyOwnerApprovalRecords(RUNNER_REPO_ROOT, freeze.supersedes?.rawSha256 ?? ''),
  );
  const approval = f0eApprovalStatus(RUNNER_REPO_ROOT);
  readiness.push({
    id: 'OWNER_FREEZE_APPROVAL_RECORD_F0E',
    ok: approval.status === 'RECORDED_AND_PINNED',
    detail: `${approval.status}: ${approval.detail}`,
  });

  // 3. The F0B predecessor bytes are byte-identical.
  const f0bSha256 = sha256Hex(readFileSync(join(RUNNER_REPO_ROOT, FREEZE_PATH)));
  if (f0bSha256 !== EXPECTED_F0B_FREEZE_RAW_SHA256 || f0bSha256 !== freeze.predecessor.rawSha256) {
    refuseReadiness('F0B_PREDECESSOR_BYTE_IDENTICAL', `F0B hashes to ${f0bSha256}.`);
  }
  readiness.push({ id: 'F0B_PREDECESSOR_BYTE_IDENTICAL', ok: true, detail: f0bSha256 });

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
  const mismatches = f0cBatchMismatches(freeze, batches);
  if (mismatches.length > 0) {
    refuseReadiness(
      'FROZEN_BATCHES_RECONSTRUCTED',
      `differ from the freeze: ${mismatches.join(', ')}.`,
    );
  }
  readiness.push({
    id: 'FROZEN_BATCHES_RECONSTRUCTED',
    ok: true,
    detail: `${batches.length} batches, ${corpus.rows.length} DEVELOPMENT rows; 12 V3 identities and 24 attempt-1 comparator identities recomputed`,
  });

  // 5. The plan: order, count, one variant, the pinned F0E plan SHA-256 (and NOT the superseded F0C plan).
  const plan = buildF0EExecutionPlan(freeze, loaded.rawSha256);
  if (!f0ePlanOrderIsFrozen(plan)) {
    refuseReadiness(
      'PLAN_ORDER_FROZEN',
      'the plan is not the one V3 variant over ordinals 1..12 in order.',
    );
  }
  const rebuiltPlanSha256 = f0ePlanSha256(plan);
  if (rebuiltPlanSha256 === APPROVED_F0C_PLAN_SHA256) {
    refuseReadiness('PLAN_SHA256_PINNED', 'the rebuilt plan is the SUPERSEDED F0C plan.');
  }
  if (rebuiltPlanSha256 !== PROPOSED_F0E_PLAN_SHA256) {
    refuseReadiness(
      'PLAN_SHA256_PINNED',
      `rebuilt plan SHA-256 ${rebuiltPlanSha256} is not the pinned F0E plan ${PROPOSED_F0E_PLAN_SHA256}.`,
    );
  }
  const scheduledVariants = [...new Set(plan.evaluations.map((e) => e.variantName))];
  if (scheduledVariants.length !== 1 || scheduledVariants[0] !== ATTEMPT_2_VARIANT_NAME) {
    refuseReadiness('PLAN_ONE_VARIANT', `scheduled variants: ${scheduledVariants.join(', ')}.`);
  }
  if (plan.evaluations.some((e) => e.variantGitCommit !== F0E_VARIANT.gitCommit)) {
    refuseReadiness('PLAN_RUNTIME_COMMIT', 'an evaluation names a runtime commit other than V3B.');
  }
  readiness.push({
    id: 'PLAN_SHA256_PINNED',
    ok: true,
    detail: `${rebuiltPlanSha256}; ${plan.plannedLogicalEvaluations} logical evaluations of ${ATTEMPT_2_VARIANT_NAME} at ${F0E_VARIANT.gitCommit}, ordinals 1..12; PROMPT_V1_CANONICAL and PROMPT_V2_CANONICAL scheduled 0 times; the superseded F0C plan ${APPROVED_F0C_PLAN_SHA256} is not reproduced`,
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
  const violations = holdoutBoundaryViolations(freeze, plan);
  if (violations.length > 0) {
    refuseReadiness('HOLDOUT_BOUNDARY', `the plan carries ${violations.join(', ')}.`);
  }
  readiness.push({
    id: 'HOLDOUT_BOUNDARY',
    ok: true,
    detail: 'no never-read path and no HOLDOUT token in the canonical plan bytes',
  });

  // 8. The V3 root, if supplied (real Git and filesystem probes; loads the root's SDK-free modules only).
  let rootVerification: VariantRootVerification | null = null;
  if (options.v3Root !== null) {
    rootVerification = await verifyV3Root(
      options.v3Root,
      freeze,
      io.rootProbes ?? createRealVariantRootProbes(),
    );
  }
  const rootOk = rootVerification === null || rootVerification.ok;

  // 9. The attempt-1 comparator, if supplied — READ-ONLY.
  let comparator: Attempt1ComparatorVerification | null = null;
  if (options.attempt1Root !== null) {
    comparator = verifyAttempt1Comparator(RUNNER_REPO_ROOT, freeze, options.attempt1Root);
  }
  const comparatorOk = comparator === null || comparator.ok;

  const summary = {
    mode: options.execute ? 'EXECUTE_REQUESTED' : 'PLAN_ONLY',
    attemptNo: ATTEMPT_2_NO,
    freezeRevision: freeze.freezeRevision,
    f0eApprovalStatus: approval.status,
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
    v3Root:
      rootVerification === null
        ? null
        : {
            root: rootVerification.root,
            ok: rootVerification.ok,
            checks: rootVerification.checks,
            claudeCodeExecutable: rootVerification.claudeCodeExecutable,
          },
    attempt1Comparator: comparator,
    executionAuthorisation: 'NOT_EVALUATED_IN_PLAN_ONLY_MODE',
  };

  if (!options.execute) {
    io.stdout(
      options.json
        ? `${JSON.stringify({ ...summary, plan }, null, 2)}\n`
        : renderPlanText(summary, plan),
    );
    return rootOk && comparatorOk ? 0 : 1;
  }

  // EXECUTION PATH — every gate, in order, before the first child.
  const missing: string[] = [];
  if (options.v3Root === null) missing.push('--v3-root');
  if (options.outputRoot === null) missing.push('--output-root');
  if (options.attemptNo === null) missing.push('--attempt-no');
  if (options.classifierConfigDir === null) missing.push('--classifier-config-dir');
  if (options.authorisation === null) missing.push('--authorisation');
  if (missing.length > 0) {
    io.stderr(`REFUSED: attempt-2 execution requires ${missing.join(', ')}.\n`);
    return 2;
  }
  if (options.attemptNo !== ATTEMPT_2_NO) {
    io.stderr(
      `REFUSED: the F0E freeze configures attempt ${ATTEMPT_2_NO}; --attempt-no ${options.attemptNo} is not it.\n`,
    );
    return 2;
  }
  if (rootVerification === null || !rootVerification.ok) {
    io.stderr(
      `REFUSED: the V3 root failed verification.\n${JSON.stringify(summary.v3Root, null, 2)}\n`,
    );
    return 2;
  }
  if (!comparatorOk) {
    io.stderr(
      `REFUSED: the attempt-1 comparator root failed read-only verification.\n${JSON.stringify(comparator, null, 2)}\n`,
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
    options.v3Root!,
    ...(options.attempt1Root === null ? [] : [options.attempt1Root]),
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
  // F0D: attempt-2 evidence starts in a FRESH namespace. Attempt-1 evidence is
  // read-only comparator input and is never inside it; nothing pre-existing
  // may be inside it either, so a stray or planted artifact cannot be
  // mistaken for attempt-2 output.
  const existing = readdirSync(outputRootDecision.outputRoot);
  if (existing.length > 0) {
    io.stderr(
      `REFUSED: output root ATTEMPT2_OUTPUT_ROOT_NOT_EMPTY: the attempt-2 output root must be an empty directory; it holds ${existing.length} entr${existing.length === 1 ? 'y' : 'ies'} (${existing.slice(0, 5).join(', ')}).\n`,
    );
    return 2;
  }
  // The LAST gate before the lock: every readiness check above must already
  // hold, and then the replacement freeze must be owner-approved (recorded
  // AND pinned) before any authorisation is even read.
  if (approval.status !== 'RECORDED_AND_PINNED') {
    io.stderr(`REFUSED: REPLACEMENT_FREEZE_NOT_OWNER_APPROVED: ${approval.detail}\n`);
    return 2;
  }
  const lock = evaluateAttempt2ExecutionLock({
    executeFlag: options.execute,
    authorisationPath: options.authorisation,
    expected: { outputRoot: outputRootDecision.outputRoot, attemptNo: options.attemptNo! },
    readFile: (path) => readFileSync(path),
    sha256: sha256Hex,
    alreadyConsumed: (sha) => isAuthorisationConsumed(outputRootDecision.outputRoot, sha),
    nowUtc: io.nowUtc,
  });
  if (!lock.granted) {
    io.stderr(`REFUSED: attempt-2 execution lock ${lock.refusal}: ${lock.detail}\n`);
    return 2;
  }
  const result = await runExperiment({
    plan,
    freezePath,
    outputRoot: outputRootDecision.outputRoot,
    attemptNo: options.attemptNo!,
    authorisation: lock.authorisation,
    authorisationSha256: lock.authorisationSha256,
    variantRoots: { [ATTEMPT_2_VARIANT_NAME]: options.v3Root! },
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

function renderPlanText(summary: Record<string, unknown>, plan: Attempt2ExecutionPlan): string {
  const lines: string[] = [
    'PHASE 2B-2D2C attempt-2 runner — PLAN / READINESS ONLY (no provider, auth, database or network call was made; nothing was written)',
    `freeze ${String(summary['freezeVersion'])} (${String(summary['freezeRevision'])}) raw sha256 ${String(summary['freezeConfigRawSha256'])} (${String(summary['freezeRawBytes'])} bytes) — ${String(summary['f0eApprovalStatus'])}`,
    `plan sha256 ${String(summary['planSha256'])}; ${plan.plannedLogicalEvaluations} logical evaluations of ${ATTEMPT_2_VARIANT_NAME} at ${F0E_VARIANT.gitCommit}, attempt ${plan.attemptNo}, concurrency 1`,
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
  const root = summary['v3Root'] as {
    root: string;
    ok: boolean;
    checks: readonly { id: string; ok: boolean; detail: string }[];
  } | null;
  if (root !== null) {
    lines.push(
      '',
      `${ATTEMPT_2_VARIANT_NAME} root ${root.root}: ${root.ok ? 'VERIFIED' : 'REFUSED'}`,
    );
    for (const check of root.checks)
      lines.push(`  ${check.ok ? 'ok ' : 'FAIL'} ${check.id}: ${check.detail}`);
  }
  const comparator = summary['attempt1Comparator'] as Attempt1ComparatorVerification | null;
  if (comparator !== null) {
    lines.push(
      '',
      `attempt-1 comparator ${comparator.root}: ${comparator.ok ? 'VERIFIED READ-ONLY' : 'REFUSED'} — ${comparator.detail}`,
    );
  }
  lines.push(
    '',
    'Execution requires an OWNER-APPROVED F0E freeze (approval record pinned), then BOTH --execute AND --authorisation <absolute path> naming a NEW attempt-2 owner authorisation; nothing less enables anything. This invocation authorised nothing.',
  );
  return `${lines.join('\n')}\n`;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runF0CCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    env: { ...process.env },
    nowUtc: () => new Date(),
    launcher: createF0CProductionLauncher(),
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

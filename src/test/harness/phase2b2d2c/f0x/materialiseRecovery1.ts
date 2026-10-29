/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — REQUEST-FREE MATERIALISATION.
 *
 * Creates, exactly once, what the owner approved materialising and nothing
 * else: the recovery study root, its ten EMPTY slot roots, the recovery control
 * directory, ten fresh per-slot recovery candidates, ONE proposed recovery
 * study-approval candidate naming all ten in frozen order, and a summary. Then
 * it runs the all-ten preflight under the recovery-1 authority in
 * VERIFICATION-ONLY mode.
 *
 * It has NO execution path: it never calls the study executor, the
 * coordinator's `runExperiment`, a child launcher or a provider (asserted by
 * the F0X firewall), and it never writes under a slot root. It refuses before
 * creating anything unless: the working tree is clean, HEAD equals its pushed
 * upstream, HEAD descends from the corrected implementation commit, the failed
 * study re-inventories exactly (`failedStudyImmutabilityProblems`), and
 * neither the recovery root nor the control directory exists yet. Every file is written `wx` (never
 * overwritten). The approval binds the CURRENT HEAD as its execution build:
 * any later commit makes it refuse with `EXECUTION_HEAD_MISMATCH`.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0x/materialiseRecovery1.ts [--validity-hours <1..24>]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../constants.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../../orgunits/classify/repair.js';
import {
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
} from '../f0o/authorisationF0O.js';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../f0v/freezeF0V.js';
import { F0V_SLOTS, type StudySlotIdentity } from '../f0v/studyPlanCore.js';
import { historicalIdentityOf } from '../f0w/slotExecutionPlan.js';
import { runAllTenPreflight, type AllTenPreflightDecision } from './allTenPreflight.js';
import {
  createProductionRecovery1Authority,
  createRecovery1PreflightProbes,
  forbiddenOutputRootContainersFor,
  gitCommand,
  isF0XSlotAuthorisationConsumed,
  loadProductionRecovery1Binding,
  loadRegistry,
  outputRootProbes,
  RUNNER_REPO_ROOT,
  sequencingProbes,
  sha256Hex,
} from './cliF0X.js';
import {
  buildF0XRecovery1SlotAuthorisationStatement,
  buildF0XRecovery1StudyApprovalStatement,
  expectedRecovery1ApprovalBinding,
  expectedRecoveryOf,
  F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION,
  F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_VERSION,
  type F0XRecovery1SlotAuthorisation,
  type F0XRecovery1StudyExecutionApproval,
} from './recovery1Authority.js';
import { recovery1MappingFor, type Recovery1Binding } from './recovery1Overlay.js';
import { failedStudyImmutabilityProblems } from './recovery1Preflight.js';

export const RECOVERY_1_CANDIDATES_DIRECTORY_NAME = 'candidates';
export const RECOVERY_1_STUDY_APPROVAL_FILE_NAME =
  'F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_CANDIDATE.json';
export const RECOVERY_1_MATERIALISATION_SUMMARY_FILE_NAME = 'materialisation-summary.json';

/** One fresh recovery candidate for `slot`. Every frozen field is derived; nothing is typed. */
export function buildRecovery1SlotCandidate(
  binding: Recovery1Binding,
  slot: StudySlotIdentity,
  issuedAtUtc: string,
  validUntilUtc: string,
): F0XRecovery1SlotAuthorisation {
  const identity = historicalIdentityOf(slot.variantName);
  return {
    authorisationVersion: F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: F0V_APPROVAL_RECORD_RAW_SHA256 as string,
    f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
    slotId: slot.slotId,
    sequence: slot.sequence,
    pairNumber: slot.pairNumber,
    variantName: slot.variantName,
    sourceHistoricalFreezeRawSha256: identity.historicalFreezeRawSha256,
    sourceHistoricalPlanSha256: identity.historicalPlanSha256,
    runtimeCommit: identity.runtimeCommit,
    promptVersion: identity.promptVersion,
    promptSha256: identity.promptSha256,
    historicalAttemptNo: identity.historicalAttemptNo,
    maxLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    frozenLogicalBatchOrdinals: Array.from(
      { length: EXPECTED_LOGICAL_BATCHES_PER_VARIANT },
      (_, index) => index + 1,
    ),
    maxProviderRequests: ATTEMPT4_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    prohibitions: {
      holdout: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      promptChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
      v6OrFutureVariantScheduling: 'NONE',
      otherSlotExecution: 'NONE',
    },
    outputRoot: recovery1MappingFor(binding, slot.slotId).recoveryOutputRoot,
    issuedAtUtc,
    validUntilUtc,
    operatorAuthorisationStatement: buildF0XRecovery1SlotAuthorisationStatement(slot, binding),
    recoveryOf: expectedRecoveryOf(binding, slot),
  };
}

/** The ONE recovery study-approval candidate over exactly these candidate bytes, in frozen order. */
export function buildRecovery1StudyApprovalCandidate(
  binding: Recovery1Binding,
  executionIntegrationCommit: string,
  candidates: readonly { readonly slot: StudySlotIdentity; readonly bytes: Buffer }[],
  issuedAtUtc: string,
  validUntilUtc: string,
): F0XRecovery1StudyExecutionApproval {
  const slots = candidates.map(({ slot, bytes }) => ({
    slotId: slot.slotId,
    sequence: slot.sequence,
    variantName: slot.variantName,
    candidateAuthorisationSha256: sha256Hex(bytes),
    candidateAuthorisationBytes: bytes.length,
    outputRoot: recovery1MappingFor(binding, slot.slotId).recoveryOutputRoot,
  }));
  return {
    approvalVersion: F0X_RECOVERY_1_STUDY_EXECUTION_APPROVAL_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: F0V_APPROVAL_RECORD_RAW_SHA256 as string,
    f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
    executionIntegrationCommit,
    slots,
    issuedAtUtc,
    validUntilUtc,
    operatorApprovalStatement: buildF0XRecovery1StudyApprovalStatement(
      executionIntegrationCommit,
      slots,
      binding,
    ),
    recovery: expectedRecovery1ApprovalBinding(binding),
  };
}

/** `JSON.stringify(value, null, 2)` + newline, as UTF-8 bytes. */
export function recovery1FileBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

class MaterialisationRefusal extends Error {
  override readonly name = 'MaterialisationRefusal';
}

async function main(argv: readonly string[]): Promise<number> {
  let validityHours = 12;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--validity-hours') {
      validityHours = Number(argv[index + 1]);
      index += 1;
      if (!Number.isInteger(validityHours) || validityHours < 1 || validityHours > 24) {
        throw new MaterialisationRefusal('--validity-hours must be an integer from 1 to 24.');
      }
    } else {
      throw new MaterialisationRefusal(`unknown argument ${JSON.stringify(argv[index])}.`);
    }
  }

  const repoRoot = RUNNER_REPO_ROOT;
  const binding = loadProductionRecovery1Binding(repoRoot);
  const recovery = binding.overlay.recoveryNamespace;
  const probes = createRecovery1PreflightProbes(repoRoot);

  // --- Refuse before creating anything. ---
  const status = gitCommand(repoRoot, ['status', '--porcelain']);
  if (status !== '') throw new MaterialisationRefusal('the working tree is not clean.');
  const head = gitCommand(repoRoot, ['rev-parse', 'HEAD']);
  const upstream = gitCommand(repoRoot, ['rev-parse', '@{upstream}']);
  if (head !== upstream) {
    throw new MaterialisationRefusal(`HEAD ${head} is not its pushed upstream ${upstream}.`);
  }
  if (
    !probes.commitIsAncestorOfHead(binding.overlay.correctedExecution.correctedImplementationCommit)
  ) {
    throw new MaterialisationRefusal(
      'HEAD does not descend from the corrected implementation commit.',
    );
  }
  const immutability = failedStudyImmutabilityProblems(binding, repoRoot, probes);
  if (immutability.length > 0) {
    throw new MaterialisationRefusal(
      `failed-study immutability refused: ${immutability.join(' | ')}`,
    );
  }
  for (const path of [recovery.studyRoot, recovery.controlDir]) {
    if (probes.isRealDirectory(path)) {
      throw new MaterialisationRefusal(
        `${path} already exists; recovery-1 is materialised exactly once.`,
      );
    }
  }

  // --- Create the namespace (non-recursive: the parent must already exist). ---
  mkdirSync(recovery.studyRoot);
  for (const slot of F0V_SLOTS)
    mkdirSync(recovery1MappingFor(binding, slot.slotId).recoveryOutputRoot);
  mkdirSync(recovery.controlDir);
  const candidatesDir = join(recovery.controlDir, RECOVERY_1_CANDIDATES_DIRECTORY_NAME);
  mkdirSync(candidatesDir);

  const issued = new Date();
  const issuedAtUtc = issued.toISOString();
  const validUntilUtc = new Date(issued.getTime() + validityHours * 3_600_000).toISOString();

  const candidates = F0V_SLOTS.map((slot) => {
    const bytes = recovery1FileBytes(
      buildRecovery1SlotCandidate(binding, slot, issuedAtUtc, validUntilUtc),
    );
    const path = join(candidatesDir, `${slot.slotId}.json`);
    writeFileSync(path, bytes, { flag: 'wx' });
    return { slot, bytes, path };
  });
  const approvalBytes = recovery1FileBytes(
    buildRecovery1StudyApprovalCandidate(binding, head, candidates, issuedAtUtc, validUntilUtc),
  );
  const approvalPath = join(recovery.controlDir, RECOVERY_1_STUDY_APPROVAL_FILE_NAME);
  writeFileSync(approvalPath, approvalBytes, { flag: 'wx' });

  // --- Verification-only all-ten preflight under the recovery-1 authority. ---
  const authority = createProductionRecovery1Authority(repoRoot, binding);
  const preflight: AllTenPreflightDecision = runAllTenPreflight({
    registry: loadRegistry(repoRoot),
    candidatePathForSlot: (slotId) => join(candidatesDir, `${slotId}.json`),
    studyApprovalPath: approvalPath,
    readFile: probes.readFile,
    sha256: sha256Hex,
    nowUtc: () => new Date(),
    currentHead: () => gitCommand(repoRoot, ['rev-parse', 'HEAD']),
    alreadyConsumed: isF0XSlotAuthorisationConsumed,
    sequencingProbes: sequencingProbes(),
    outputRootProbes: outputRootProbes(),
    forbiddenOutputRootContainers: forbiddenOutputRootContainersFor(repoRoot, binding),
    studyRoot: recovery.studyRoot,
    authority,
  });

  const summary = {
    materialisation: 'F0X_RECOVERY_1_REQUEST_FREE',
    executed: false,
    providerRequests: 0,
    overlayId: binding.overlay.overlayId,
    overlayRawSha256: binding.overlayRawSha256,
    head,
    issuedAtUtc,
    validUntilUtc,
    recoveryStudyRoot: recovery.studyRoot,
    recoveryControlDir: recovery.controlDir,
    candidates: candidates.map(({ slot, bytes, path }) => ({
      slotId: slot.slotId,
      sequence: slot.sequence,
      variantName: slot.variantName,
      path,
      sha256: sha256Hex(bytes),
      byteLength: bytes.length,
      outputRoot: recovery1MappingFor(binding, slot.slotId).recoveryOutputRoot,
      recoveryOfSpentCandidate: recovery1MappingFor(binding, slot.slotId)
        .spentCandidateAuthorisationSha256,
    })),
    approvalPath,
    approvalSha256: sha256Hex(approvalBytes),
    approvalByteLength: approvalBytes.length,
    verificationOnlyPreflight: preflight,
  };
  writeFileSync(
    join(recovery.controlDir, RECOVERY_1_MATERIALISATION_SUMMARY_FILE_NAME),
    recovery1FileBytes(summary),
    { flag: 'wx' },
  );
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return preflight.granted ? 0 : 1;
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`,
      );
      process.exitCode = 2;
    });
}

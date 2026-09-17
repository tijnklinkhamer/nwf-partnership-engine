/**
 * PHASE 2B-2D2C-F3 — REQUEST-FREE EXECUTION-CANDIDATE MATERIALISATION.
 *
 * Creates, exactly once, what the owner authorised materialising and NOTHING
 * else: the frozen CONTROL namespace, one candidate directory inside it, five
 * per-slot execution-authorisation CANDIDATES, and one non-authorising
 * inventory manifest.
 *
 * WHAT IT DELIBERATELY DOES NOT CREATE.
 *
 *   The study root and the five slot output roots. F0X's recovery
 *   materialiser created its study root and ten slot roots up front; this
 *   task explicitly forbids that. The consequence is intended and is the
 *   whole safety story: composed gate 6 (OUTPUT_ROOT) cannot pass while those
 *   directories are absent, so even a hypothetical valid study approval could
 *   not launch a slot until the owner separately authorises creating them.
 *
 *   A study-level owner execution approval. Its absence is what makes the
 *   five candidates inert: composed gate 3 refuses with
 *   `APPROVAL_PATH_ABSENT`, before the output-root gate is ever reached.
 *
 * IT HAS NO EXECUTION PATH. It never calls the execution guard's dispatch
 * stage, a coordinator, `runExperiment`, a child launcher, an auth-status
 * runner or a provider; the F3 firewall asserts this by exact symbol name.
 * Every file is written `wx` (never overwritten) and every `mkdirSync` is
 * non-recursive (the parent must already exist).
 *
 * IT REFUSES BEFORE CREATING ANYTHING unless: the working tree is clean, HEAD
 * equals its pushed upstream, the approved F2 freeze and the owner
 * freeze-approval record both still match their pinned SHA-256 AND byte
 * length, and none of the control root, the study root or any of the five
 * slot output roots exists yet.
 *
 * VALIDITY WINDOW. Twelve hours, inherited unchanged from the established
 * F0W/F0X materialisation convention (`f0x/materialiseRecovery1.ts`, which
 * defaults `validityHours = 12`; both F0X materialisations on disk carry an
 * exact twelve-hour window). No new, longer window is invented here.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f3/materialiseF3Candidates.ts
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../../../orgunits/classify/repair.js';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  FROZEN_AGENT_SDK_VERSION,
  FROZEN_AUTH_STATUS_TIMEOUT_MS,
  FROZEN_DEFAULT_MAX_TURNS,
  FROZEN_MAX_TRANSIENT_RETRIES,
  FROZEN_TIER1_GRACE_MS,
  FROZEN_TIER1_SOFT_DEADLINE_MS,
  FROZEN_TIER1_TOTAL_BUDGET_MS,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  RELIABILITY_SEMANTICS_V2,
} from '../constants.js';
import {
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
} from '../f0o/authorisationF0O.js';
import {
  F0Z_RELIABILITY_BASE_COMMIT,
  F2_APPROVAL_RECORD_PATH,
  F2_APPROVAL_RECORD_RAW_BYTES,
  F2_APPROVAL_RECORD_RAW_SHA256,
  F2_CONTROL_ROOT,
  F2_FREEZE_PATH,
  F2_INTEGRATED_RUNTIME_COMMIT,
  F2_STUDY_ROOT,
  PROPOSED_F2_FREEZE_RAW_BYTES,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_SHA256,
  V6_PROMPT_VERSION,
  V6_SEMANTIC_SOURCE_COMMIT,
} from '../f2/freezeF2.js';
import {
  F2_SLOTS,
  F2_VARIANT_NAME,
  f2OutputRootPathOf,
  type F2SlotIdentity,
} from '../f2/studyPlanCoreF2.js';
import {
  buildF3SlotAuthorisationStatement,
  verifyF3SlotAuthorisationCandidate,
  F3_SLOT_AUTHORISATION_VERSION,
  F3_STUDY_ID,
  type F3SlotExecutionAuthorisation,
} from './authorisationF3.js';
import { evaluateF3ComposedSlotExecutionDecision } from './composedExecutionDecisionF3.js';
import { loadF3SlotRegistry, type F3SlotRegistry } from './slotRegistryF3.js';
import { F3_STUDY_EXECUTION_APPROVAL_VERSION } from './studyExecutionApprovalF3.js';

/** Inherited unchanged from the F0W/F0X materialisation convention. Never lengthened for convenience. */
export const F3_CANDIDATE_VALIDITY_HOURS = 12;

export const F3_CANDIDATES_DIRECTORY_NAME = 'execution-candidates';
export const F3_CANDIDATE_MANIFEST_FILE_NAME = 'EXECUTION_CANDIDATE_MANIFEST.json';
export const F3_CANDIDATE_MANIFEST_KIND = 'EXECUTION_CANDIDATE_INVENTORY_NOT_AN_APPROVAL';

export function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** `JSON.stringify(value, null, 2)` + newline, as UTF-8 bytes — the established convention. */
export function f3FileBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** One fresh candidate for `slot`. Every frozen field is derived; nothing is hand-typed. */
export function buildF3SlotCandidate(
  slot: F2SlotIdentity,
  executionBuildCommit: string,
  requestedModelId: string,
  issuedAtUtc: string,
  validUntilUtc: string,
): F3SlotExecutionAuthorisation {
  return {
    authorisationVersion: F3_SLOT_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: F3_STUDY_ID,
    f2FreezeRawSha256: PROPOSED_F2_FREEZE_RAW_SHA256,
    f2FreezeRawBytes: PROPOSED_F2_FREEZE_RAW_BYTES,
    f2PlanSha256: PROPOSED_F2_PLAN_SHA256,
    f2OwnerFreezeApprovalRawSha256: F2_APPROVAL_RECORD_RAW_SHA256,
    f2OwnerFreezeApprovalRawBytes: F2_APPROVAL_RECORD_RAW_BYTES,
    slotId: slot.slotId,
    sequence: slot.sequence,
    replicateNumber: slot.replicateNumber,
    variantName: F2_VARIANT_NAME,
    semanticSourceCommit: V6_SEMANTIC_SOURCE_COMMIT,
    reliabilityBaseCommit: F0Z_RELIABILITY_BASE_COMMIT,
    integratedRuntimeCommit: F2_INTEGRATED_RUNTIME_COMMIT,
    promptVersion: V6_PROMPT_VERSION,
    promptSha256: V6_PROMPT_SHA256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    c2Implemented: false,
    c2Status: 'NOT_IMPLEMENTED',
    executionBuildCommit,
    maxLogicalEvaluations: EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
    frozenLogicalBatchOrdinals: Array.from(
      { length: EXPECTED_LOGICAL_BATCHES_PER_VARIANT },
      (_, index) => index + 1,
    ),
    documentCount: EXPECTED_CORPUS_ITEM_COUNT,
    maxProviderRequests: ATTEMPT4_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
    maxNonTerminalTimeoutsPerReplicate: MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    },
    requestedModelId,
    agentSdkVersion: FROZEN_AGENT_SDK_VERSION,
    runConfig: { maxTurns: FROZEN_DEFAULT_MAX_TURNS, thinking: 'disabled' },
    frozenTimeouts: {
      attemptSoftDeadlineMs: FROZEN_TIER1_SOFT_DEADLINE_MS,
      abortCloseSettlementGraceMs: FROZEN_TIER1_GRACE_MS,
      totalProviderCallBudgetMs: FROZEN_TIER1_TOTAL_BUDGET_MS,
      authStatusTimeoutMs: FROZEN_AUTH_STATUS_TIMEOUT_MS,
      maxTransientRetriesPerRequest: FROZEN_MAX_TRANSIENT_RETRIES,
      attemptsPerProviderRequest: FROZEN_MAX_TRANSIENT_RETRIES + 1,
    },
    prohibitions: {
      holdout: 'NONE',
      goldLabelChanges: 'NONE',
      thresholdChanges: 'NONE',
      promptChanges: 'NONE',
      databaseWrites: 'NONE',
      migrationWrites: 'NONE',
      otherSlotExecution: 'NONE',
      scoring: 'NONE',
    },
    outputRoot: f2OutputRootPathOf(F2_STUDY_ROOT, slot),
    issuedAtUtc,
    validUntilUtc,
    operatorAuthorisationStatement: buildF3SlotAuthorisationStatement(
      slot,
      executionBuildCommit,
      requestedModelId,
    ),
  };
}

export interface F3CandidateManifestSlotEntry {
  readonly slotId: string;
  readonly sequence: number;
  readonly replicateNumber: number;
  readonly candidatePath: string;
  readonly candidateSha256: string;
  readonly candidateBytes: number;
  readonly outputRoot: string;
  readonly outputRootExists: boolean;
}

/**
 * The external, NON-AUTHORISING inventory. It carries no operator approval
 * statement of any kind — deliberately, so no reader and no future tool can
 * mistake it for the study-level execution approval that does not exist. Its
 * six explicit `...Authorised: false` fields say so in the bytes themselves.
 */
export function buildF3CandidateManifest(
  executionBuildCommit: string,
  slots: readonly F3CandidateManifestSlotEntry[],
): Readonly<Record<string, unknown>> {
  return {
    manifestKind: F3_CANDIDATE_MANIFEST_KIND,
    studyId: F3_STUDY_ID,
    scope: 'DEVELOPMENT_ONLY',
    note:
      'An INVENTORY of execution-authorisation CANDIDATES. It authorises nothing, approves nothing ' +
      'and is not an owner decision. Execution additionally requires a separate study-level owner ' +
      'execution approval naming every candidate SHA-256 and byte length below, which does not exist.',
    slotAuthorisationVersion: F3_SLOT_AUTHORISATION_VERSION,
    studyExecutionApprovalVersion: F3_STUDY_EXECUTION_APPROVAL_VERSION,
    executionBuildCommit,
    f2FreezePath: F2_FREEZE_PATH,
    f2FreezeRawSha256: PROPOSED_F2_FREEZE_RAW_SHA256,
    f2FreezeRawBytes: PROPOSED_F2_FREEZE_RAW_BYTES,
    f2PlanSha256: PROPOSED_F2_PLAN_SHA256,
    f2OwnerFreezeApprovalPath: F2_APPROVAL_RECORD_PATH,
    f2OwnerFreezeApprovalRawSha256: F2_APPROVAL_RECORD_RAW_SHA256,
    f2OwnerFreezeApprovalRawBytes: F2_APPROVAL_RECORD_RAW_BYTES,
    promptVersion: V6_PROMPT_VERSION,
    promptSha256: V6_PROMPT_SHA256,
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    c2Status: 'NOT_IMPLEMENTED',
    studyRoot: F2_STUDY_ROOT,
    studyRootCreatedByThisMaterialisation: false,
    controlRoot: F2_CONTROL_ROOT,
    candidateValidityHours: F3_CANDIDATE_VALIDITY_HOURS,
    slots,
    ownerExecutionApprovalExists: false,
    studyLevelExecutionApprovalExists: false,
    providerCallsAuthorised: false,
    executionAuthorised: false,
    scoringAuthorised: false,
    holdoutAuthorised: false,
  };
}

class F3MaterialisationRefusal extends Error {
  override readonly name = 'F3MaterialisationRefusal';
}

/** `git` with a fixed argument vector, no shell, scoped to one repository. */
function gitCommand(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
}

function assertIdentity(path: string, expectedSha256: string, expectedBytes: number): void {
  const bytes = readFileSync(path);
  const actual = sha256Hex(bytes);
  if (actual !== expectedSha256) {
    throw new F3MaterialisationRefusal(`${path} hashes to ${actual}; ${expectedSha256} is pinned.`);
  }
  if (bytes.length !== expectedBytes) {
    throw new F3MaterialisationRefusal(
      `${path} is ${bytes.length} bytes; ${expectedBytes} are pinned.`,
    );
  }
}

const RUNNER_REPO_ROOT = resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
);

function main(argv: readonly string[]): number {
  if (argv.length > 0) {
    throw new F3MaterialisationRefusal(
      `unknown argument ${JSON.stringify(argv[0])}; this materialiser takes none — the validity window is the inherited ${F3_CANDIDATE_VALIDITY_HOURS}-hour convention and is not operator-tunable.`,
    );
  }
  const repoRoot = RUNNER_REPO_ROOT;

  // --- Refuse before creating anything. ---
  if (gitCommand(repoRoot, ['status', '--porcelain']) !== '') {
    throw new F3MaterialisationRefusal('the working tree is not clean.');
  }
  const head = gitCommand(repoRoot, ['rev-parse', 'HEAD']);
  const upstream = gitCommand(repoRoot, ['rev-parse', '@{upstream}']);
  if (head !== upstream) {
    throw new F3MaterialisationRefusal(`HEAD ${head} is not its pushed upstream ${upstream}.`);
  }

  const freezePath = join(repoRoot, F2_FREEZE_PATH);
  const ownerApprovalPath = join(repoRoot, F2_APPROVAL_RECORD_PATH);
  assertIdentity(freezePath, PROPOSED_F2_FREEZE_RAW_SHA256, PROPOSED_F2_FREEZE_RAW_BYTES);
  assertIdentity(ownerApprovalPath, F2_APPROVAL_RECORD_RAW_SHA256, F2_APPROVAL_RECORD_RAW_BYTES);

  const registry: F3SlotRegistry = loadF3SlotRegistry(readFileSync(freezePath));

  // The control root is created here. The study root and every slot output
  // root must be ABSENT and must STAY absent — this task creates neither.
  if (existsSync(F2_CONTROL_ROOT)) {
    throw new F3MaterialisationRefusal(
      `${F2_CONTROL_ROOT} already exists; the F3 control namespace is materialised exactly once.`,
    );
  }
  if (existsSync(F2_STUDY_ROOT)) {
    throw new F3MaterialisationRefusal(
      `${F2_STUDY_ROOT} exists; this task must not create or reuse the study root.`,
    );
  }
  for (const slot of F2_SLOTS) {
    const root = f2OutputRootPathOf(F2_STUDY_ROOT, slot);
    if (existsSync(root)) {
      throw new F3MaterialisationRefusal(`${root} exists; no slot output root may exist yet.`);
    }
  }

  // --- Create ONLY the control namespace (non-recursive: parent must exist). ---
  mkdirSync(F2_CONTROL_ROOT);
  const candidatesDir = join(F2_CONTROL_ROOT, F3_CANDIDATES_DIRECTORY_NAME);
  mkdirSync(candidatesDir);

  const issued = new Date();
  const issuedAtUtc = issued.toISOString();
  const validUntilUtc = new Date(
    issued.getTime() + F3_CANDIDATE_VALIDITY_HOURS * 3_600_000,
  ).toISOString();

  const written = F2_SLOTS.map((slot) => {
    const bytes = f3FileBytes(
      buildF3SlotCandidate(slot, head, registry.requestedModelId, issuedAtUtc, validUntilUtc),
    );
    const path = join(candidatesDir, `${slot.slotId}.json`);
    writeFileSync(path, bytes, { flag: 'wx' });
    return { slot, path };
  });

  // --- Re-read every candidate FROM DISK and verify it independently. ---
  const verified: F3CandidateManifestSlotEntry[] = written.map(({ slot, path }) => {
    const onDisk = readFileSync(path);
    const decision = verifyF3SlotAuthorisationCandidate({
      authorisationPath: path,
      expected: { slotId: slot.slotId, outputRoot: f2OutputRootPathOf(F2_STUDY_ROOT, slot) },
      readFile: (candidatePath) => readFileSync(candidatePath),
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: () => new Date(),
      currentHead: () => head,
      expectedRequestedModelId: registry.requestedModelId,
      resolveSlot: (slotId) => registry.resolveSlot(slotId),
    });
    if (!decision.granted) {
      throw new F3MaterialisationRefusal(
        `${slot.slotId}: the candidate just written does not verify (${decision.refusal}: ${decision.detail}).`,
      );
    }
    if (decision.authorisation.executionBuildCommit !== head) {
      throw new F3MaterialisationRefusal(`${slot.slotId}: the candidate does not name HEAD.`);
    }
    const outputRoot = f2OutputRootPathOf(F2_STUDY_ROOT, slot);
    if (decision.authorisation.outputRoot !== outputRoot) {
      throw new F3MaterialisationRefusal(
        `${slot.slotId}: the candidate names a foreign output root.`,
      );
    }
    // Verified as a PATH only. This materialisation never creates it.
    if (existsSync(outputRoot)) {
      throw new F3MaterialisationRefusal(`${slot.slotId}: its output root must not exist yet.`);
    }
    return {
      slotId: slot.slotId,
      sequence: slot.sequence,
      replicateNumber: slot.replicateNumber,
      candidatePath: path,
      candidateSha256: sha256Hex(onDisk),
      candidateBytes: onDisk.length,
      outputRoot,
      outputRootExists: false,
    };
  });

  const hashes = verified.map((entry) => entry.candidateSha256);
  if (new Set(hashes).size !== hashes.length) {
    throw new F3MaterialisationRefusal('two candidates share a SHA-256.');
  }
  const roots = verified.map((entry) => entry.outputRoot);
  if (new Set(roots).size !== roots.length) {
    throw new F3MaterialisationRefusal('two candidates share an output root.');
  }

  const manifestBytes = f3FileBytes(buildF3CandidateManifest(head, verified));
  const manifestPath = join(F2_CONTROL_ROOT, F3_CANDIDATE_MANIFEST_FILE_NAME);
  writeFileSync(manifestPath, manifestBytes, { flag: 'wx' });

  // --- Prove the candidates alone authorise nothing: no study approval. ---
  const composedWithNoApproval = F2_SLOTS.map((slot) => {
    const decision = evaluateF3ComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: join(candidatesDir, `${slot.slotId}.json`),
      studyApprovalPath: null,
      readFile: (path) => readFileSync(path),
      sha256: sha256Hex,
      nowUtc: () => new Date(),
      currentHead: () => head,
      alreadyConsumed: () => false,
      sequencingProbes: {
        isDirectory: () => false,
        listFilesRecursively: () => [],
        readFile: (path) => readFileSync(path),
      },
      outputRootProbes: {
        realpath: (path) => realpathSync(path),
        isDirectory: (path) => existsSync(path) && lstatSync(path).isDirectory(),
      },
      forbiddenOutputRootContainers: [repoRoot],
    });
    if (decision.granted) {
      throw new F3MaterialisationRefusal(
        `${slot.slotId}: a composed decision GRANTED with no study approval — this must be impossible.`,
      );
    }
    return { slotId: slot.slotId, failedGate: decision.failedGate, refusal: decision.refusal };
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        materialisation: 'F3_V6_EXECUTION_CANDIDATES_REQUEST_FREE',
        executed: false,
        providerRequests: 0,
        executionBuildCommit: head,
        issuedAtUtc,
        validUntilUtc,
        controlRoot: F2_CONTROL_ROOT,
        candidatesDirectory: candidatesDir,
        candidates: verified,
        manifestPath,
        manifestSha256: sha256Hex(manifestBytes),
        manifestBytes: manifestBytes.length,
        studyRootExists: existsSync(F2_STUDY_ROOT),
        composedDecisionWithNoStudyApproval: composedWithNoApproval,
      },
      null,
      2,
    )}\n`,
  );
  return 0;
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

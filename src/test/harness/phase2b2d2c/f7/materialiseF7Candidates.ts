/**
 * PHASE 2B-2D2C-F7 — REQUEST-FREE MATERIALISATION OF THE FIVE F6 RESTART
 * EXECUTION CANDIDATES, BOUND TO THE F7 EXECUTION BUILD.
 *
 * Creates, exactly once, what the owner authorised and NOTHING else: the F6
 * CONTROL root, one versioned candidate directory inside it, five F7 slot
 * candidates bound to the checked-out build, and one non-authorising
 * inventory. Every file is written `wx` and both `mkdirSync` calls are
 * non-recursive (the parent must already exist).
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never creates the F6 study root or a
 * slot output root; never creates a study-level execution approval; never
 * calls the executor, a coordinator, a child launcher, an auth-status runner
 * or a provider; never touches F5 (it re-hashes the F5 study and control
 * roots before and after, and refuses on any difference).
 *
 * IT REFUSES BEFORE CREATING ANYTHING unless the working tree is clean, HEAD
 * equals its pushed upstream, the F6 study context verifies in full at this
 * build (F6 freeze, F6 owner approval, F2 freeze and approval, inherited F0O
 * freeze, rebuilt plans for all five slots), the F5 evidence is byte-identical
 * to its closure inventory, and neither the F6 control root, the F6 study root
 * nor any F6 slot root exists.
 *
 * After writing, it proves the candidates authorise nothing on their own: the
 * executor's write-free pre-start checks, run with `studyApprovalPath: null`,
 * must refuse at ALL_FIVE_PREFLIGHT with APPROVAL_PATH_ABSENT for every slot
 * while every candidate itself verifies.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f7/materialiseF7Candidates.ts
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { F0O_FREEZE_PATH } from '../f0o/freezeF0O.js';
import { F2_APPROVAL_RECORD_PATH, F2_FREEZE_PATH } from '../f2/freezeF2.js';
import {
  F5_CONTROL_ROOT,
  F5_CONTROL_ROOT_FILE_COUNT,
  F5_CONTROL_ROOT_INVENTORY_SHA256,
  F5_STUDY_ROOT,
  F5_STUDY_ROOT_FILE_COUNT,
  F5_STUDY_ROOT_INVENTORY_SHA256,
} from '../f6/f5ClosureF6.js';
import { computeRootInventory } from '../f6/rootInventoryF6.js';
import { F6_SLOTS } from '../f6/studyPlanCoreF6.js';
import {
  buildF7CandidateInventory,
  F7_CANDIDATE_INVENTORY_PATH,
  F7_CANDIDATE_VALIDITY_HOURS,
  F7_CANDIDATES_DIRECTORY,
  f7CandidatePathForSlot,
  type F7CandidateInventorySlotEntry,
} from './candidateInventoryF7.js';
import { f7SlotRegistryOf } from './executionGatesF7.js';
import { F7_STUDY_CONTEXT_PATHS, loadF7RestartStudyContext } from './restartStudyContextF7.js';
import {
  buildF7SlotCandidate,
  evaluateF7SlotExecutionLock,
  f7OutputRootOf,
} from './slotAuthorisationF7.js';
import { buildF7RestartSlotRunnerPlan } from './slotRunnerPlanF7.js';
import { runF7PreStartChecks } from './studyExecutorF7.js';
import { F7_CONTROL_ROOT, F7_STUDY_ROOT } from './studyRootsF7.js';

class F7MaterialisationRefusal extends Error {
  override readonly name = 'F7MaterialisationRefusal';
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function fileBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function gitCommand(repoRoot: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
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

/** F5 is immutable historical evidence: both roots must still be byte-identical to the closure inventory. */
function assertF5EvidenceUnchanged(): void {
  for (const [root, fileCount, inventorySha256] of [
    [F5_STUDY_ROOT, F5_STUDY_ROOT_FILE_COUNT, F5_STUDY_ROOT_INVENTORY_SHA256],
    [F5_CONTROL_ROOT, F5_CONTROL_ROOT_FILE_COUNT, F5_CONTROL_ROOT_INVENTORY_SHA256],
  ] as const) {
    const inventory = computeRootInventory(root);
    if (inventory.fileCount !== fileCount || inventory.inventorySha256 !== inventorySha256) {
      throw new F7MaterialisationRefusal(
        `${root} inventories to ${inventory.fileCount} files ${inventory.inventorySha256}; the F5 closure pins ${fileCount} files ${inventorySha256}.`,
      );
    }
  }
}

function main(argv: readonly string[]): number {
  if (argv.length > 0) {
    throw new F7MaterialisationRefusal(
      `unknown argument ${JSON.stringify(argv[0])}; this materialiser takes none — the validity window is the inherited ${F7_CANDIDATE_VALIDITY_HOURS}-hour convention.`,
    );
  }
  const repoRoot = RUNNER_REPO_ROOT;

  // --- Refuse before creating anything. ---
  if (gitCommand(repoRoot, ['status', '--porcelain']) !== '') {
    throw new F7MaterialisationRefusal('the working tree is not clean.');
  }
  const head = gitCommand(repoRoot, ['rev-parse', 'HEAD']);
  const upstream = gitCommand(repoRoot, ['rev-parse', '@{upstream}']);
  if (head !== upstream) {
    throw new F7MaterialisationRefusal(`HEAD ${head} is not its pushed upstream ${upstream}.`);
  }

  const context = loadF7RestartStudyContext({
    f6FreezeBytes: readFileSync(join(repoRoot, F7_STUDY_CONTEXT_PATHS.f6Freeze)),
    f6OwnerFreezeApprovalBytes: readFileSync(
      join(repoRoot, F7_STUDY_CONTEXT_PATHS.f6OwnerFreezeApproval),
    ),
    f2FreezeBytes: readFileSync(join(repoRoot, F2_FREEZE_PATH)),
    f2OwnerFreezeApprovalBytes: readFileSync(join(repoRoot, F2_APPROVAL_RECORD_PATH)),
    f0oFreezeBytes: readFileSync(join(repoRoot, F0O_FREEZE_PATH)),
  });
  for (const slot of F6_SLOTS) buildF7RestartSlotRunnerPlan(context, slot.slotId);
  const registry = f7SlotRegistryOf(context.f4.requestedModelId);

  assertF5EvidenceUnchanged();

  for (const path of [F7_CONTROL_ROOT, F7_STUDY_ROOT, ...F6_SLOTS.map(f7OutputRootOf)]) {
    if (existsSync(path)) {
      throw new F7MaterialisationRefusal(
        `${path} already exists; this materialisation creates only a fresh control root, and never a study or slot root.`,
      );
    }
  }

  // --- Create ONLY the control root and its candidate directory (non-recursive). ---
  mkdirSync(F7_CONTROL_ROOT);
  mkdirSync(F7_CANDIDATES_DIRECTORY);

  const issued = new Date();
  const issuedAtUtc = issued.toISOString();
  const validUntilUtc = new Date(
    issued.getTime() + F7_CANDIDATE_VALIDITY_HOURS * 3_600_000,
  ).toISOString();

  const entries: F7CandidateInventorySlotEntry[] = F6_SLOTS.map((slot) => {
    const path = f7CandidatePathForSlot(slot.slotId);
    writeFileSync(
      path,
      fileBytes(
        buildF7SlotCandidate(slot, head, context.f4.requestedModelId, issuedAtUtc, validUntilUtc),
      ),
      { flag: 'wx' },
    );
    const onDisk = readFileSync(path);
    const outputRoot = f7OutputRootOf(slot);
    const decision = evaluateF7SlotExecutionLock({
      authorisationPath: path,
      expected: { slotId: slot.slotId, outputRoot },
      readFile: (candidatePath) => readFileSync(candidatePath),
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: () => new Date(),
      currentHead: () => head,
      expectedRequestedModelId: registry.requestedModelId,
      resolveSlot: registry.resolveSlot,
    });
    if (!decision.granted) {
      throw new F7MaterialisationRefusal(
        `${slot.slotId}: the candidate just written does not verify (${decision.refusal}: ${decision.detail}).`,
      );
    }
    if (
      decision.authorisation.executionBuildCommit !== head ||
      decision.authorisation.f6PlanSha256 !== context.f6PlanSha256 ||
      decision.authorisationSha256 !== sha256Hex(onDisk)
    ) {
      throw new F7MaterialisationRefusal(
        `${slot.slotId}: the candidate does not bind this build and the approved F6 plan.`,
      );
    }
    return {
      slotId: slot.slotId,
      sequence: slot.sequence,
      replicateNumber: slot.replicateNumber,
      candidatePath: path,
      candidateSha256: decision.authorisationSha256,
      candidateBytes: onDisk.length,
      outputRoot,
      outputRootExists: false,
    };
  });

  if (new Set(entries.map((entry) => entry.candidateSha256)).size !== entries.length) {
    throw new F7MaterialisationRefusal('two candidates share a SHA-256.');
  }
  if (new Set(entries.map((entry) => entry.outputRoot)).size !== entries.length) {
    throw new F7MaterialisationRefusal('two candidates share an output root.');
  }

  const inventoryBytes = fileBytes(
    buildF7CandidateInventory(head, issuedAtUtc, validUntilUtc, entries),
  );
  writeFileSync(F7_CANDIDATE_INVENTORY_PATH, inventoryBytes, { flag: 'wx' });

  assertF5EvidenceUnchanged();

  // --- Prove the candidates alone authorise nothing. ---
  const preStart = runF7PreStartChecks({
    runnerRepoRoot: repoRoot,
    candidatePathForSlot: f7CandidatePathForSlot,
    studyApprovalPath: null,
    readFile: (path) => readFileSync(path),
    sha256: sha256Hex,
    currentHead: () => gitCommand(repoRoot, ['rev-parse', 'HEAD']),
    workingTreeClean: () => gitCommand(repoRoot, ['status', '--porcelain']) === '',
    alreadyConsumed: () => false,
    sequencingProbes: {
      isDirectory: () => false,
      listFilesRecursively: () => [],
      readFile: (path) => readFileSync(path),
    },
    outputRootProbes: { realpath: (path) => path, isDirectory: (path) => existsSync(path) },
    forbiddenOutputRootContainers: [repoRoot, F7_CONTROL_ROOT, F5_STUDY_ROOT, F5_CONTROL_ROOT],
    nowUtc: () => new Date(),
  });
  if (
    preStart.status !== 'BLOCKED_BEFORE_START' ||
    preStart.stage !== 'ALL_FIVE_PREFLIGHT' ||
    preStart.preflight === null ||
    preStart.preflight.slots.some(
      (slot) => slot.studyApprovalRefusal !== 'APPROVAL_PATH_ABSENT' || !slot.candidateGranted,
    )
  ) {
    throw new F7MaterialisationRefusal(
      'the pre-start checks did not refuse for the absent study approval with every candidate verified — this must be impossible.',
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        materialisation: 'F7_F6_RESTART_EXECUTION_CANDIDATES_REQUEST_FREE',
        executed: false,
        providerRequests: 0,
        executionBuild: head,
        issuedAtUtc,
        validUntilUtc,
        controlRoot: F7_CONTROL_ROOT,
        candidatesDirectory: F7_CANDIDATES_DIRECTORY,
        candidates: entries,
        inventoryPath: F7_CANDIDATE_INVENTORY_PATH,
        inventorySha256: sha256Hex(inventoryBytes),
        inventoryBytes: inventoryBytes.length,
        studyRootExists: existsSync(F7_STUDY_ROOT),
        preStartWithNoStudyApproval: {
          status: preStart.status,
          stage: preStart.stage,
          detail: preStart.detail,
          slots: preStart.preflight.slots.map((slot) => ({
            slotId: slot.slotId,
            candidateGranted: slot.candidateGranted,
            studyApprovalRefusal: slot.studyApprovalRefusal,
            outputRootValid: slot.outputRootValid,
          })),
        },
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

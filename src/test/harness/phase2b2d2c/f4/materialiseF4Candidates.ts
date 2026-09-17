/**
 * PHASE 2B-2D2C-F4 — REQUEST-FREE MATERIALISATION OF FRESH EXECUTION
 * CANDIDATES BOUND TO THE F4 EXECUTION BUILD.
 *
 * Creates, exactly once, what the owner authorised and NOTHING else: one new
 * versioned candidate directory under the EXISTING frozen control root, five
 * F3-schema candidates bound to the checked-out F4 build, and one
 * non-authorising F4 inventory that names the F3 inventory and build it
 * supersedes.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never touches the five F3 candidates or
 * the F3 inventory (it verifies their exact bytes before and after); never
 * creates the study root or a slot output root; never creates a study-level
 * owner execution approval; never calls the executor, a coordinator, a child
 * launcher, an auth-status runner or a provider. Every file is written `wx`
 * and the one `mkdirSync` is non-recursive.
 *
 * IT REFUSES BEFORE CREATING ANYTHING unless: the working tree is clean; HEAD
 * equals its pushed upstream; HEAD is NOT the pre-dispatch F3 build; the
 * approved study verifies in full at this build (F2 freeze, owner
 * freeze-approval record, inherited F0O freeze, rebuilt plans for all five
 * slots); the F3 inventory and all five F3 candidates are byte-identical to the
 * recorded supersession; and neither the F4 directory, the F4 inventory, the
 * study root nor any slot output root exists.
 *
 * After writing, it proves the candidates authorise nothing on their own: the
 * executor's own write-free pre-start checks, run with `studyApprovalPath:
 * null`, must refuse at ALL_FIVE_PREFLIGHT with APPROVAL_PATH_ABSENT.
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f4/materialiseF4Candidates.ts
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { F0O_FREEZE_PATH } from '../f0o/freezeF0O.js';
import {
  F2_APPROVAL_RECORD_PATH,
  F2_CONTROL_ROOT,
  F2_FREEZE_PATH,
  F2_STUDY_ROOT,
} from '../f2/freezeF2.js';
import { F2_SLOTS, f2OutputRootPathOf } from '../f2/studyPlanCoreF2.js';
import { verifyF3SlotAuthorisationCandidate } from '../f3/authorisationF3.js';
import { buildF3SlotCandidate, f3FileBytes } from '../f3/materialiseF3Candidates.js';
import {
  buildF4CandidateManifest,
  F3_CANDIDATE_MANIFEST_PATH,
  F3_CANDIDATE_MANIFEST_SHA256,
  F3_CANDIDATES_DIRECTORY,
  F3_PRE_DISPATCH_EXECUTION_BUILD,
  F3_SUPERSESSION_RECORD_PATH,
  F4_CANDIDATE_MANIFEST_PATH,
  F4_CANDIDATE_VALIDITY_HOURS,
  F4_CANDIDATES_DIRECTORY,
  f4CandidatePathForSlot,
  type F4CandidateManifestSlotEntry,
} from './candidateInventoryF4.js';
import { runF4PreStartChecks } from './studyExecutorF4.js';
import { buildF4V6SlotRunnerPlan } from './v6SlotRunnerPlanF4.js';
import { loadF4V6StudyContext } from './v6StudyContextF4.js';

class F4MaterialisationRefusal extends Error {
  override readonly name = 'F4MaterialisationRefusal';
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
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

interface SupersessionRecord {
  readonly supersededManifest: { readonly sha256: string };
  readonly supersededExecutionBuild: string;
  readonly candidates: readonly {
    readonly slotId: string;
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
}

/** The F3 evidence must be byte-identical to what was recorded when it was superseded. */
function assertF3EvidenceUnchanged(): SupersessionRecord {
  if (!existsSync(F3_SUPERSESSION_RECORD_PATH)) {
    throw new F4MaterialisationRefusal(`${F3_SUPERSESSION_RECORD_PATH} does not exist.`);
  }
  const record = JSON.parse(
    readFileSync(F3_SUPERSESSION_RECORD_PATH, 'utf8'),
  ) as SupersessionRecord;
  if (
    record.supersededManifest.sha256 !== F3_CANDIDATE_MANIFEST_SHA256 ||
    record.supersededExecutionBuild !== F3_PRE_DISPATCH_EXECUTION_BUILD ||
    sha256Hex(readFileSync(F3_CANDIDATE_MANIFEST_PATH)) !== F3_CANDIDATE_MANIFEST_SHA256
  ) {
    throw new F4MaterialisationRefusal(
      'the F3 inventory is not the recorded superseded inventory.',
    );
  }
  if (record.candidates.length !== F2_SLOTS.length) {
    throw new F4MaterialisationRefusal(
      'the supersession record does not list all five F3 candidates.',
    );
  }
  for (const [index, slot] of F2_SLOTS.entries()) {
    const entry = record.candidates[index]!;
    const expectedPath = join(F3_CANDIDATES_DIRECTORY, `${slot.slotId}.json`);
    const bytes = readFileSync(expectedPath);
    if (
      entry.slotId !== slot.slotId ||
      entry.path !== expectedPath ||
      sha256Hex(bytes) !== entry.sha256 ||
      bytes.length !== entry.bytes
    ) {
      throw new F4MaterialisationRefusal(
        `the F3 candidate ${expectedPath} is not byte-identical to its recorded supersession.`,
      );
    }
    const parsed = JSON.parse(bytes.toString('utf8')) as { executionBuildCommit?: unknown };
    if (parsed.executionBuildCommit !== F3_PRE_DISPATCH_EXECUTION_BUILD) {
      throw new F4MaterialisationRefusal(
        `the F3 candidate ${expectedPath} does not bind the pre-dispatch build.`,
      );
    }
  }
  return record;
}

function main(argv: readonly string[]): number {
  if (argv.length > 0) {
    throw new F4MaterialisationRefusal(
      `unknown argument ${JSON.stringify(argv[0])}; this materialiser takes none — the validity window is the inherited ${F4_CANDIDATE_VALIDITY_HOURS}-hour convention.`,
    );
  }
  const repoRoot = RUNNER_REPO_ROOT;

  // --- Refuse before creating anything. ---
  if (gitCommand(repoRoot, ['status', '--porcelain']) !== '') {
    throw new F4MaterialisationRefusal('the working tree is not clean.');
  }
  const head = gitCommand(repoRoot, ['rev-parse', 'HEAD']);
  const upstream = gitCommand(repoRoot, ['rev-parse', '@{upstream}']);
  if (head !== upstream) {
    throw new F4MaterialisationRefusal(`HEAD ${head} is not its pushed upstream ${upstream}.`);
  }
  if (head === F3_PRE_DISPATCH_EXECUTION_BUILD) {
    throw new F4MaterialisationRefusal(
      'HEAD is the pre-dispatch F3 build; F4 candidates bind the F4 build only.',
    );
  }

  const f2FreezeBytes = readFileSync(join(repoRoot, F2_FREEZE_PATH));
  const context = loadF4V6StudyContext({
    f2FreezeBytes,
    f2OwnerFreezeApprovalBytes: readFileSync(join(repoRoot, F2_APPROVAL_RECORD_PATH)),
    f0oFreezeBytes: readFileSync(join(repoRoot, F0O_FREEZE_PATH)),
  });
  for (const slot of F2_SLOTS) buildF4V6SlotRunnerPlan(context, slot.slotId);

  const supersession = assertF3EvidenceUnchanged();

  if (!existsSync(F2_CONTROL_ROOT)) {
    throw new F4MaterialisationRefusal(
      `${F2_CONTROL_ROOT} does not exist; F4 materialises into the existing control root.`,
    );
  }
  for (const path of [F4_CANDIDATES_DIRECTORY, F4_CANDIDATE_MANIFEST_PATH]) {
    if (existsSync(path)) {
      throw new F4MaterialisationRefusal(
        `${path} already exists; F4 candidates are materialised exactly once.`,
      );
    }
  }
  if (existsSync(F2_STUDY_ROOT)) {
    throw new F4MaterialisationRefusal(
      `${F2_STUDY_ROOT} exists; this task must not create or reuse the study root.`,
    );
  }
  for (const slot of F2_SLOTS) {
    const root = f2OutputRootPathOf(F2_STUDY_ROOT, slot);
    if (existsSync(root))
      throw new F4MaterialisationRefusal(`${root} exists; no slot output root may exist yet.`);
  }

  // --- Create ONLY the new candidate directory (non-recursive). ---
  mkdirSync(F4_CANDIDATES_DIRECTORY);

  const issued = new Date();
  const issuedAtUtc = issued.toISOString();
  const validUntilUtc = new Date(
    issued.getTime() + F4_CANDIDATE_VALIDITY_HOURS * 3_600_000,
  ).toISOString();

  const entries: F4CandidateManifestSlotEntry[] = F2_SLOTS.map((slot) => {
    const path = f4CandidatePathForSlot(slot.slotId);
    writeFileSync(
      path,
      f3FileBytes(
        buildF3SlotCandidate(slot, head, context.requestedModelId, issuedAtUtc, validUntilUtc),
      ),
      { flag: 'wx' },
    );
    const onDisk = readFileSync(path);
    const outputRoot = f2OutputRootPathOf(F2_STUDY_ROOT, slot);
    const decision = verifyF3SlotAuthorisationCandidate({
      authorisationPath: path,
      expected: { slotId: slot.slotId, outputRoot },
      readFile: (candidatePath) => readFileSync(candidatePath),
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: () => new Date(),
      currentHead: () => head,
      expectedRequestedModelId: context.requestedModelId,
      resolveSlot: (slotId) => {
        const found = F2_SLOTS.find((candidate) => candidate.slotId === slotId);
        if (found === undefined) throw new F4MaterialisationRefusal(`unknown slot ${slotId}`);
        return found;
      },
    });
    if (!decision.granted) {
      throw new F4MaterialisationRefusal(
        `${slot.slotId}: the candidate just written does not verify (${decision.refusal}: ${decision.detail}).`,
      );
    }
    if (
      decision.authorisation.executionBuildCommit !== head ||
      decision.authorisation.f2PlanSha256 !== context.f2PlanSha256 ||
      decision.authorisationSha256 !== sha256Hex(onDisk)
    ) {
      throw new F4MaterialisationRefusal(
        `${slot.slotId}: the candidate does not bind this build and the approved plan.`,
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
    throw new F4MaterialisationRefusal('two candidates share a SHA-256.');
  }
  if (new Set(entries.map((entry) => entry.outputRoot)).size !== entries.length) {
    throw new F4MaterialisationRefusal('two candidates share an output root.');
  }

  const manifestBytes = f3FileBytes(
    buildF4CandidateManifest(head, issuedAtUtc, validUntilUtc, entries),
  );
  writeFileSync(F4_CANDIDATE_MANIFEST_PATH, manifestBytes, { flag: 'wx' });

  // --- The F3 evidence is still byte-identical after writing. ---
  assertF3EvidenceUnchanged();

  // --- Prove the candidates alone authorise nothing. ---
  const preStart = runF4PreStartChecks({
    runnerRepoRoot: repoRoot,
    candidatePathForSlot: f4CandidatePathForSlot,
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
    forbiddenOutputRootContainers: [repoRoot, F2_CONTROL_ROOT],
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
    throw new F4MaterialisationRefusal(
      'the pre-start checks did not refuse for the absent study approval with every candidate verified — this must be impossible.',
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        materialisation: 'F4_V6_EXECUTION_CANDIDATES_REQUEST_FREE',
        executed: false,
        providerRequests: 0,
        executionBuild: head,
        supersedesManifest: supersession.supersededManifest.sha256,
        supersedesExecutionBuild: supersession.supersededExecutionBuild,
        issuedAtUtc,
        validUntilUtc,
        candidatesDirectory: F4_CANDIDATES_DIRECTORY,
        candidates: entries,
        manifestPath: F4_CANDIDATE_MANIFEST_PATH,
        manifestSha256: sha256Hex(manifestBytes),
        manifestBytes: manifestBytes.length,
        studyRootExists: existsSync(F2_STUDY_ROOT),
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

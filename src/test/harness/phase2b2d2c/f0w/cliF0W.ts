/**
 * PHASE 2B-2D2C-F0W — THE REQUEST-FREE READINESS CLI.
 *
 * Unlike every prior F0-series CLI (`cliF0I.ts`, `cliF0O.ts`), this one has
 * NO `--execute` flag and NO execution branch anywhere in it: F0W's owner
 * brief forbids materialising any real candidate, creating any real output
 * root, or issuing any study execution approval. This CLI can only REPORT —
 * whether the approved F0V/F0U bytes this build was compiled against still
 * verify, whether the frozen study root and its ten slot roots are still
 * absent, and (opt-in) whether a CANDIDATE authorisation or study-approval
 * file would structurally verify — never grant, never execute, never
 * consume.
 *
 * Invoked directly via tsx, exactly like every other F0-series CLI (none of
 * them is wired into `package.json`):
 *
 *   node --import tsx src/test/harness/phase2b2d2c/f0w/cliF0W.ts [--json]
 *     [--verify-authorisation-candidate <path> --slot <slotId>]
 *     [--verify-study-approval-candidate <path>]
 *
 * Pure I/O aside from the injected `F0WCliIo`. No provider, no network, no
 * database, no clock outside the injected one, no child process.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { F0I_FREEZE_PATH, loadF0IFreezeFromBytes } from '../f0i/freezeF0I.js';
import { F0O_FREEZE_PATH, loadF0OFreezeFromBytes } from '../f0o/freezeF0O.js';
import { F0U_METHODOLOGY_PATH, F0V_FREEZE_PATH, F0V_STUDY_ROOT } from '../f0v/freezeF0V.js';
import { F0V_TOTAL_SLOTS, futureOutputRootPathOf } from '../f0v/studyPlanCore.js';
import {
  verifyF0WSlotAuthorisationCandidate,
  type F0WSlotExecutionLockDecision,
} from './authorisationF0W.js';
import { inspectStudyRootReadiness, type StudyRootReadiness } from './outputRootReadiness.js';
import { historicalIdentityOf } from './slotExecutionPlan.js';
import {
  loadStudySlotRegistry,
  SlotRegistryError,
  type StudySlotRegistry,
} from './slotRegistry.js';
import {
  verifyF0WStudyExecutionApprovalCandidate,
  type F0WStudyExecutionApprovalDecision,
} from './studyExecutionApproval.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RUNNER_REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

export interface F0WCliOptions {
  readonly json: boolean;
  readonly verifySlotCandidatePath: string | null;
  readonly verifySlotId: string | null;
  readonly verifyStudyApprovalCandidatePath: string | null;
}

export function parseF0WCliArgs(argv: readonly string[]): F0WCliOptions {
  let json = false;
  let verifySlotCandidatePath: string | null = null;
  let verifySlotId: string | null = null;
  let verifyStudyApprovalCandidatePath: string | null = null;
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === '--json') {
      json = true;
      index += 1;
    } else if (arg === '--verify-authorisation-candidate') {
      verifySlotCandidatePath = argv[index + 1] ?? null;
      index += 2;
    } else if (arg === '--slot') {
      verifySlotId = argv[index + 1] ?? null;
      index += 2;
    } else if (arg === '--verify-study-approval-candidate') {
      verifyStudyApprovalCandidatePath = argv[index + 1] ?? null;
      index += 2;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return {
    json,
    verifySlotCandidatePath,
    verifySlotId,
    verifyStudyApprovalCandidatePath,
  };
}

export interface F0WCliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly nowUtc: () => Date;
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export interface F0WReadinessReport {
  readonly f0vFreezeVerified: boolean;
  readonly f0vFreezeRawSha256: string | null;
  readonly f0iFreezeVerified: boolean;
  readonly f0oFreezeVerified: boolean;
  readonly f0uMethodologyPathReferenced: string;
  readonly totalSlots: number;
  readonly outputRootReadiness: StudyRootReadiness | null;
  readonly problems: readonly string[];
}

/**
 * Verifies (never creates) that this build's approved F0V/F0I/F0O bytes
 * still agree with production, and that the frozen study root and all ten
 * slot roots remain absent. Any mismatch is reported, never repaired.
 */
export function buildReadinessReport(repoRoot: string): F0WReadinessReport {
  const problems: string[] = [];
  let f0vFreezeVerified = false;
  let f0vFreezeRawSha256: string | null = null;
  let registry: StudySlotRegistry | null = null;
  try {
    const bytes = readFileSync(join(repoRoot, F0V_FREEZE_PATH));
    registry = loadStudySlotRegistry(bytes);
    f0vFreezeVerified = true;
    f0vFreezeRawSha256 = registry.f0vFreezeRawSha256;
  } catch (error) {
    problems.push(
      `F0V freeze did not verify: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let f0iFreezeVerified = false;
  try {
    loadF0IFreezeFromBytes(readFileSync(join(repoRoot, F0I_FREEZE_PATH)));
    f0iFreezeVerified = true;
  } catch (error) {
    problems.push(
      `F0I freeze did not verify: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  let f0oFreezeVerified = false;
  try {
    loadF0OFreezeFromBytes(readFileSync(join(repoRoot, F0O_FREEZE_PATH)));
    f0oFreezeVerified = true;
  } catch (error) {
    problems.push(
      `F0O freeze did not verify: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const outputRootReadiness =
    registry === null
      ? null
      : inspectStudyRootReadiness(
          { exists: (path) => existsSync(path) },
          F0V_STUDY_ROOT,
          registry.slots,
        );
  if (outputRootReadiness !== null && !outputRootReadiness.allAbsent) {
    problems.push(
      'the frozen study root or one of its ten slot roots already exists; readiness requires all eleven to be absent.',
    );
  }
  return {
    f0vFreezeVerified,
    f0vFreezeRawSha256,
    f0iFreezeVerified,
    f0oFreezeVerified,
    f0uMethodologyPathReferenced: F0U_METHODOLOGY_PATH,
    totalSlots: F0V_TOTAL_SLOTS,
    outputRootReadiness,
    problems,
  };
}

export async function runF0WCli(argv: readonly string[], io: F0WCliIo): Promise<number> {
  let options: F0WCliOptions;
  try {
    options = parseF0WCliArgs(argv);
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  const readiness = buildReadinessReport(RUNNER_REPO_ROOT);

  let slotCandidate: F0WSlotExecutionLockDecision | null = null;
  if (options.verifySlotCandidatePath !== null) {
    if (options.verifySlotId === null) {
      io.stderr('--verify-authorisation-candidate requires --slot <slotId>\n');
      return 2;
    }
    let registry: StudySlotRegistry;
    try {
      registry = loadStudySlotRegistry(readFileSync(join(RUNNER_REPO_ROOT, F0V_FREEZE_PATH)));
    } catch (error) {
      io.stderr(
        `could not load the slot registry: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      return 1;
    }
    const path = isAbsolute(options.verifySlotCandidatePath)
      ? options.verifySlotCandidatePath
      : resolve(process.cwd(), options.verifySlotCandidatePath);
    // `expected` must reflect the NAMED slot's own frozen identity for the
    // output-root/attempt checks to be meaningful — an unknown slotId is
    // itself a refusal, never a crash.
    let expected: {
      readonly slotId: string;
      readonly outputRoot: string;
      readonly attemptNo: number;
    };
    try {
      const slot = registry.resolveSlot(options.verifySlotId);
      const identity = historicalIdentityOf(slot.variantName);
      expected = {
        slotId: slot.slotId,
        outputRoot: futureOutputRootPathOf(F0V_STUDY_ROOT, slot),
        attemptNo: identity.historicalAttemptNo,
      };
    } catch (error) {
      if (!(error instanceof SlotRegistryError)) throw error;
      expected = { slotId: options.verifySlotId, outputRoot: '', attemptNo: -1 };
    }
    slotCandidate = verifyF0WSlotAuthorisationCandidate({
      authorisationPath: path,
      expected,
      readFile: (p) => readFileSync(p),
      sha256: sha256Hex,
      alreadyConsumed: () => false,
      nowUtc: io.nowUtc,
      resolveSlot: (slotId) => registry.resolveSlot(slotId),
    });
  }

  let studyApprovalCandidate: F0WStudyExecutionApprovalDecision | null = null;
  if (options.verifyStudyApprovalCandidatePath !== null) {
    const path = isAbsolute(options.verifyStudyApprovalCandidatePath)
      ? options.verifyStudyApprovalCandidatePath
      : resolve(process.cwd(), options.verifyStudyApprovalCandidatePath);
    studyApprovalCandidate = verifyF0WStudyExecutionApprovalCandidate({
      approvalPath: path,
      readFile: (p) => readFileSync(p),
      sha256: sha256Hex,
      nowUtc: io.nowUtc,
    });
  }

  const summary = {
    readiness,
    slotCandidate,
    studyApprovalCandidate,
    outcome:
      readiness.problems.length === 0
        ? 'REPLICATION_STUDY_MECHANICALLY_READY_FOR_CANDIDATE_MATERIALISATION'
        : 'BLOCKED',
  };
  if (options.json) {
    io.stdout(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    io.stdout(`outcome: ${summary.outcome}\n`);
    io.stdout(
      `F0V freeze verified: ${readiness.f0vFreezeVerified} (${readiness.f0vFreezeRawSha256 ?? 'n/a'})\n`,
    );
    io.stdout(`F0I freeze verified: ${readiness.f0iFreezeVerified}\n`);
    io.stdout(`F0O freeze verified: ${readiness.f0oFreezeVerified}\n`);
    io.stdout(`total slots: ${readiness.totalSlots}\n`);
    io.stdout(
      `output roots all absent: ${readiness.outputRootReadiness?.allAbsent ?? 'unknown (registry did not load)'}\n`,
    );
    for (const problem of readiness.problems) io.stdout(`problem: ${problem}\n`);
    if (slotCandidate !== null) {
      io.stdout(
        slotCandidate.granted
          ? `slot candidate for ${slotCandidate.slot.slotId}: STRUCTURALLY_ACCEPTABLE\n`
          : `slot candidate: REFUSED (${slotCandidate.refusal}) — ${slotCandidate.detail}\n`,
      );
    }
    if (studyApprovalCandidate !== null) {
      io.stdout(
        studyApprovalCandidate.granted
          ? 'study approval candidate: STRUCTURALLY_ACCEPTABLE\n'
          : `study approval candidate: REFUSED (${studyApprovalCandidate.refusal}) — ${studyApprovalCandidate.detail}\n`,
      );
    }
  }
  return 0;
}

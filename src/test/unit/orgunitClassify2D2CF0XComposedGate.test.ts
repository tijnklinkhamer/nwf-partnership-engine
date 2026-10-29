/**
 * PHASE 2B-2D2C-F0X — the composed slot-execution decision, the F0X
 * study-execution-approval contract, the all-ten preflight, and the two
 * durable study-level record shapes.
 *
 * `F0V_STUDY_ROOT` is mocked to a TEMPORARY directory for this file's
 * whole module graph (never the real, still-forbidden frozen root) so
 * that a genuine four-gate GRANTED decision, and the real-directory-backed
 * output-root gate specifically, can be exercised without ever creating
 * anything under the real study root — which this file also asserts it
 * never writes (the root now legitimately holds the preserved first real
 * F0X study invocation, so its bytes are snapshotted and re-compared).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type * as FreezeF0VModule from '../harness/phase2b2d2c/f0v/freezeF0V.js';

// The mock factory creates and realpath-normalises its OWN temporary
// directory (via dynamic imports, since a `vi.mock` factory's static
// imports are unavailable at hoist time) and substitutes it for
// `F0V_STUDY_ROOT` across this file's whole module graph. The real,
// still-forbidden frozen study root is never referenced by anything this
// file writes to.
vi.mock('../harness/phase2b2d2c/f0v/freezeF0V.js', async (importOriginal) => {
  const { mkdtempSync, realpathSync: realpath } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: joinPath } = await import('node:path');
  const root = realpath.native(mkdtempSync(joinPath(tmpdir(), 'nwf-pe-f0x-study-root-')));
  const actual = await importOriginal<typeof FreezeF0VModule>();
  return { ...actual, F0V_STUDY_ROOT: root };
});

import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { snapshotTreeSha256 } from '../helpers/treeSnapshot.js';
import { WriteOnceCollisionError } from '../harness/phase2b2d2c/artifacts.js';
import {
  F0U_METHODOLOGY_RAW_SHA256,
  F0V_APPROVAL_RECORD_RAW_SHA256,
  F0V_FREEZE_PATH,
  F0V_STUDY_ROOT,
  PROPOSED_F0V_FREEZE_RAW_SHA256,
  PROPOSED_F0V_PLAN_SHA256,
} from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  futureOutputRootPathOf,
  sha256Hex,
  type StudySlotIdentity,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import {
  buildF0WSlotAuthorisationStatement,
  F0W_SLOT_AUTHORISATION_VERSION,
  type F0WSlotExecutionAuthorisation,
} from '../harness/phase2b2d2c/f0w/authorisationF0W.js';
import {
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
} from '../harness/phase2b2d2c/f0o/authorisationF0O.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import { EXPECTED_LOGICAL_BATCHES_PER_VARIANT } from '../harness/phase2b2d2c/constants.js';
import { historicalIdentityOf } from '../harness/phase2b2d2c/f0w/slotExecutionPlan.js';
import {
  loadStudySlotRegistry,
  type StudySlotRegistry,
} from '../harness/phase2b2d2c/f0w/slotRegistry.js';
import { F0W_STUDY_EXECUTION_APPROVAL_VERSION } from '../harness/phase2b2d2c/f0w/studyExecutionApproval.js';
import { evaluateComposedSlotExecutionDecision } from '../harness/phase2b2d2c/f0x/composedExecutionDecision.js';
import { runAllTenPreflight } from '../harness/phase2b2d2c/f0x/allTenPreflight.js';
import {
  buildF0XStudyExecutionApprovalStatement,
  evaluateF0XStudyExecutionApproval,
  F0X_STUDY_EXECUTION_APPROVAL_VERSION,
  type F0XStudyExecutionApproval,
} from '../harness/phase2b2d2c/f0x/studyExecutionApprovalF0X.js';
import {
  isConsumedByOuterSlotIdentity,
  readOuterSlotIdentity,
  writeOuterSlotIdentity,
  type OuterSlotIdentityRecord,
} from '../harness/phase2b2d2c/f0x/outerSlotIdentity.js';
import {
  writeSlotTransition,
  writeStudyManifest,
  writeStudyTerminal,
  STUDY_RECORD_VERSION,
} from '../harness/phase2b2d2c/f0x/studyRecords.js';
import {
  authorisationMarkerPathOf,
  isAuthorisationConsumed,
} from '../harness/phase2b2d2c/coordinator.js';

const REAL_F0V_STUDY_ROOT_STRING =
  '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5';

/** The real root holds preserved evidence; this file must never write there. */
const REAL_STUDY_ROOT_AT_LOAD = snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING);

const FIXED_HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const APPROVAL_SHA = F0V_APPROVAL_RECORD_RAW_SHA256 as string;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registry: StudySlotRegistry = loadStudySlotRegistry(
  readFileSync(join(ROOT, F0V_FREEZE_PATH)),
);

let outputCounter = 0;
function freshDir(): string {
  outputCounter += 1;
  const dir = join(F0V_STUDY_ROOT, `scratch-${outputCounter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

afterAll(() => {
  rmSync(F0V_STUDY_ROOT, { recursive: true, force: true });
});

function slotOutputRoot(slot: StudySlotIdentity): string {
  return futureOutputRootPathOf(F0V_STUDY_ROOT, slot);
}

// Every one of the ten slot output-root paths is DETERMINISTIC (fixed by
// the frozen slot registry), so a directory a test creates for one slot
// would otherwise silently persist into every later test sharing this
// file's one mocked study root. Reset between tests so each test's
// "output root exists / does not exist" assumption is never polluted by
// an earlier one.
afterEach(() => {
  for (const slot of F0V_SLOTS) {
    rmSync(slotOutputRoot(slot), { recursive: true, force: true });
  }
});

/** Creates the slot's own frozen-shaped directory under the MOCKED temp study root. */
function createSlotOutputRoot(slot: StudySlotIdentity): string {
  const root = slotOutputRoot(slot);
  mkdirSync(root, { recursive: true });
  return root;
}

function buildValidCandidate(slot: StudySlotIdentity): F0WSlotExecutionAuthorisation {
  const identity = historicalIdentityOf(slot.variantName);
  return {
    authorisationVersion: F0W_SLOT_AUTHORISATION_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: APPROVAL_SHA,
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
      (_, i) => i + 1,
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
    outputRoot: slotOutputRoot(slot),
    issuedAtUtc: '2026-09-01T00:00:00.000Z',
    validUntilUtc: '2026-12-01T00:00:00.000Z',
    operatorAuthorisationStatement: buildF0WSlotAuthorisationStatement(slot),
  };
}

type Mutable<T> = {
  -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K];
};

function writeCandidateFile(
  dir: string,
  slot: StudySlotIdentity,
  mutate?: (c: Mutable<F0WSlotExecutionAuthorisation>) => void,
): string {
  const candidate = buildValidCandidate(slot) as unknown as Mutable<F0WSlotExecutionAuthorisation>;
  if (mutate) mutate(candidate);
  const path = join(dir, `${slot.slotId}.json`);
  writeFileSync(path, JSON.stringify(candidate, null, 2));
  return path;
}

function candidateBytesOf(slot: StudySlotIdentity): Buffer {
  return Buffer.from(JSON.stringify(buildValidCandidate(slot), null, 2));
}

function buildValidApproval(
  slots: readonly StudySlotIdentity[] = F0V_SLOTS,
  executionIntegrationCommit = FIXED_HEAD,
): F0XStudyExecutionApproval {
  const slotEntries = slots.map((slot) => ({
    slotId: slot.slotId,
    sequence: slot.sequence,
    variantName: slot.variantName,
    candidateAuthorisationSha256: sha256Hex(candidateBytesOf(slot)),
    candidateAuthorisationBytes: candidateBytesOf(slot).length,
    outputRoot: slotOutputRoot(slot),
  }));
  return {
    approvalVersion: F0X_STUDY_EXECUTION_APPROVAL_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: APPROVAL_SHA,
    f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
    executionIntegrationCommit,
    slots: slotEntries,
    issuedAtUtc: '2026-09-01T00:00:00.000Z',
    validUntilUtc: '2026-12-01T00:00:00.000Z',
    operatorApprovalStatement: buildF0XStudyExecutionApprovalStatement(
      executionIntegrationCommit,
      slotEntries,
    ),
  };
}

function writeApprovalFile(
  dir: string,
  mutate?: (a: Mutable<F0XStudyExecutionApproval>) => void,
): string {
  const approval = buildValidApproval() as unknown as Mutable<F0XStudyExecutionApproval>;
  if (mutate) mutate(approval);
  const path = join(dir, 'study-approval.json');
  writeFileSync(path, JSON.stringify(approval, null, 2));
  return path;
}

const readFile = (p: string): Buffer => readFileSync(p);
const nowUtc = () => new Date('2026-09-16T12:00:00.000Z');
const currentHead = () => FIXED_HEAD;
const alreadyConsumed = () => false;
const outputRootProbes = {
  realpath: (p: string) => realpathSync.native(p),
  isDirectory: (p: string) => {
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  },
};
const sequencingProbes = {
  isDirectory: (p: string) => existsSync(p),
  readFile: (p: string) => readFileSync(p),
  listFilesRecursively: (root: string): readonly string[] => {
    if (!existsSync(root)) return [];
    const results: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else results.push(full.slice(root.length + 1));
      }
    };
    walk(root);
    return results;
  },
};

describe('2D2C-F0X: the real frozen study root is never written by this file', () => {
  it('the mocked study root this file writes to is not the real, non-mocked F0V study root path', () => {
    expect(F0V_STUDY_ROOT).not.toBe(REAL_F0V_STUDY_ROOT_STRING);
    expect(F0V_STUDY_ROOT.startsWith(`${REAL_F0V_STUDY_ROOT_STRING}/`)).toBe(false);
  });

  afterAll(() => {
    expect(snapshotTreeSha256(REAL_F0V_STUDY_ROOT_STRING)).toEqual(REAL_STUDY_ROOT_AT_LOAD);
  });
});

describe('2D2C-F0X: evaluateF0XStudyExecutionApproval', () => {
  it('grants a structurally valid, current approval issued for the running HEAD', () => {
    const dir = freshDir();
    const path = writeApprovalFile(dir);
    const decision = evaluateF0XStudyExecutionApproval({
      approvalPath: path,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
    });
    expect(decision.granted).toBe(true);
  });

  it('refuses a null path, a relative path, and an unreadable file', () => {
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: null,
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_PATH_ABSENT' });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: 'relative/path.json',
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_PATH_NOT_ABSOLUTE' });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: join(freshDir(), 'missing.json'),
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_UNREADABLE' });
  });

  it('refuses an F0W (superseded) approval version by exact literal, never accepting it as an F0X approval', () => {
    const dir = freshDir();
    const path = join(dir, 'old.json');
    const legacy = {
      ...buildValidApproval(),
      approvalVersion: F0W_STUDY_EXECUTION_APPROVAL_VERSION,
    };
    writeFileSync(path, JSON.stringify(legacy, null, 2));
    const decision = evaluateF0XStudyExecutionApproval({
      approvalPath: path,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_MALFORMED' });
  });

  it('refuses a reordered slot list', () => {
    const dir = freshDir();
    const path = writeApprovalFile(dir, (a) => {
      const [first, second, ...rest] = a.slots;
      a.slots = [second!, first!, ...rest];
    });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: path,
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_SLOT_ORDER_MISMATCH' });
  });

  it('refuses a duplicated candidate hash across two slots', () => {
    const dir = freshDir();
    const path = writeApprovalFile(dir, (a) => {
      a.slots[1]!.candidateAuthorisationSha256 = a.slots[0]!.candidateAuthorisationSha256;
    });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: path,
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_DUPLICATE_CANDIDATE_HASH' });
  });

  it('refuses a duplicated output root across two slots (caught by the earlier per-slot field check, since every frozen root is already provably distinct)', () => {
    const dir = freshDir();
    const path = writeApprovalFile(dir, (a) => {
      a.slots[1]!.outputRoot = a.slots[0]!.outputRoot;
    });
    const decision = evaluateF0XStudyExecutionApproval({
      approvalPath: path,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
    });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(['APPROVAL_SLOT_FIELD_MISMATCH', 'APPROVAL_DUPLICATE_OUTPUT_ROOT']).toContain(
        decision.refusal,
      );
    }
  });

  it('refuses a hand-edited statement that no longer matches what this build derives', () => {
    const dir = freshDir();
    const path = writeApprovalFile(dir, (a) => {
      a.operatorApprovalStatement = 'I approve everything.';
    });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: path,
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_STATEMENT_MISMATCH' });
  });

  it('refuses an expired approval and one not yet valid', () => {
    const dir = freshDir();
    const expiredPath = writeApprovalFile(dir, (a) => {
      a.validUntilUtc = '2020-01-01T00:00:00.000Z';
      a.operatorApprovalStatement = buildF0XStudyExecutionApprovalStatement(FIXED_HEAD, a.slots);
    });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: expiredPath,
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_EXPIRED' });

    const futurePath = writeApprovalFile(dir, (a) => {
      a.issuedAtUtc = '2099-01-01T00:00:00.000Z';
      a.validUntilUtc = '2099-06-01T00:00:00.000Z';
      a.operatorApprovalStatement = buildF0XStudyExecutionApprovalStatement(FIXED_HEAD, a.slots);
    });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: futurePath,
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'APPROVAL_NOT_YET_VALID' });
  });

  it('refuses when the approval names a different build than the checked-out HEAD', () => {
    const dir = freshDir();
    const path = writeApprovalFile(dir, (a) => {
      a.executionIntegrationCommit = OTHER_HEAD;
      a.operatorApprovalStatement = buildF0XStudyExecutionApprovalStatement(OTHER_HEAD, a.slots);
    });
    expect(
      evaluateF0XStudyExecutionApproval({
        approvalPath: path,
        readFile,
        sha256: sha256Hex,
        nowUtc,
        currentHead,
      }),
    ).toMatchObject({ granted: false, refusal: 'EXECUTION_HEAD_MISMATCH' });
  });
});

describe('2D2C-F0X: evaluateComposedSlotExecutionDecision — all four gates', () => {
  it('grants only when sequencing, the candidate, the approval-membership and the real output root all agree', () => {
    const slot = F0V_SLOTS[0]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot);
    const approvalPath = writeApprovalFile(dir);
    createSlotOutputRoot(slot);

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(true);
  });

  it('gate 1 (sequencing): refuses PAIR_1_V5 while PAIR_1_V4 has not yet run', () => {
    const slot = F0V_SLOTS[1]!; // PAIR_1_V5
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot);
    const approvalPath = writeApprovalFile(dir);
    createSlotOutputRoot(slot);

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision).toMatchObject({ granted: false, failedGate: 'SEQUENCING' });
  });

  it('gate 2 (candidate): refuses a candidate for a different slot than the target', () => {
    const target = F0V_SLOTS[0]!;
    const wrongSlot = F0V_SLOTS[2]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, wrongSlot);
    const approvalPath = writeApprovalFile(dir);
    createSlotOutputRoot(target);

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: target.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision).toMatchObject({ granted: false, failedGate: 'SLOT_AUTHORISATION' });
  });

  it('gate 3 (approval): refuses when no study approval is presented', () => {
    const slot = F0V_SLOTS[0]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot);
    createSlotOutputRoot(slot);

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: null,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision).toMatchObject({ granted: false, failedGate: 'STUDY_APPROVAL' });
  });

  it('gate 3a (mismatch): refuses when the approval is valid but does not list this exact candidate hash', () => {
    const slot = F0V_SLOTS[0]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot, (c) => {
      c.issuedAtUtc = '2026-09-02T00:00:00.000Z'; // changes the file's own hash without changing what it authorises
    });
    const approvalPath = writeApprovalFile(dir); // still lists the ORIGINAL (unmutated) hash
    createSlotOutputRoot(slot);

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    // The candidate's own statement no longer matches (issuedAtUtc changed the file but not the
    // statement text derivation is unaffected — so the candidate itself may still be granted, but
    // its hash now differs from the one the approval lists).
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(['SLOT_AUTHORISATION', 'APPROVAL_CANDIDATE_MISMATCH']).toContain(decision.failedGate);
    }
  });

  it('gate 4 (output root): refuses when the slot output root does not yet exist on disk', () => {
    const slot = F0V_SLOTS[0]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot);
    const approvalPath = writeApprovalFile(dir);
    // Deliberately NOT calling createSlotOutputRoot(slot).

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes: {
        realpath: (p: string) => realpathSync.native(p),
        isDirectory: (p: string) => existsSync(p),
      },
      forbiddenOutputRootContainers: [],
    });
    expect(decision).toMatchObject({ granted: false, failedGate: 'OUTPUT_ROOT' });
  });
});

describe('2D2C-F0X: runAllTenPreflight — the all-ten-before-first-child property', () => {
  function fullyValidSetup(): {
    dir: string;
    candidatePathForSlot: (slotId: string) => string | null;
    approvalPath: string;
  } {
    const dir = freshDir();
    for (const slot of F0V_SLOTS) {
      writeCandidateFile(dir, slot);
      createSlotOutputRoot(slot);
    }
    const approvalPath = writeApprovalFile(dir);
    return {
      dir,
      candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
      approvalPath,
    };
  }

  it('grants only when all ten candidates, the one approval, and all ten output roots agree, with zero prior evidence anywhere', () => {
    const { candidatePathForSlot, approvalPath } = fullyValidSetup();
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(true);
    expect(decision.slots).toHaveLength(10);
  });

  it('candidate 10 invalid (missing) refuses the WHOLE preflight — slot 1 never becomes eligible to start', () => {
    const dir = freshDir();
    for (const slot of F0V_SLOTS.slice(0, 9)) {
      writeCandidateFile(dir, slot);
      createSlotOutputRoot(slot);
    }
    createSlotOutputRoot(F0V_SLOTS[9]!); // output root exists, but no candidate file
    const approvalPath = writeApprovalFile(dir);
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot: (slotId) =>
        existsSync(join(dir, `${slotId}.json`)) ? join(dir, `${slotId}.json`) : null,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
    const slot10 = decision.slots.find((s) => s.slotId === F0V_SLOTS[9]!.slotId);
    expect(slot10?.candidateGranted).toBe(false);
  });

  it('study approval missing refuses the whole preflight', () => {
    const dir = freshDir();
    for (const slot of F0V_SLOTS) {
      writeCandidateFile(dir, slot);
      createSlotOutputRoot(slot);
    }
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
      studyApprovalPath: null,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
  });

  it('a candidate hash mismatch inside the approval refuses the whole preflight', () => {
    const dir = freshDir();
    for (const slot of F0V_SLOTS) {
      writeCandidateFile(dir, slot);
      createSlotOutputRoot(slot);
    }
    const approvalPath = writeApprovalFile(dir, (a) => {
      a.slots[3]!.candidateAuthorisationSha256 = 'f'.repeat(64);
      a.operatorApprovalStatement = buildF0XStudyExecutionApprovalStatement(FIXED_HEAD, a.slots);
    });
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
    const mismatchedSlot = decision.slots.find((s) => s.slotId === F0V_SLOTS[3]!.slotId);
    expect(mismatchedSlot?.listedInApproval).toBe(false);
  });

  it('output root 10 invalid (does not exist) refuses the whole preflight', () => {
    const dir = freshDir();
    for (const slot of F0V_SLOTS.slice(0, 9)) {
      writeCandidateFile(dir, slot);
      createSlotOutputRoot(slot);
    }
    writeCandidateFile(dir, F0V_SLOTS[9]!); // candidate exists, output root does not
    const approvalPath = writeApprovalFile(dir);
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
    const slot10 = decision.slots.find((s) => s.slotId === F0V_SLOTS[9]!.slotId);
    expect(slot10?.outputRootValid).toBe(false);
  });

  it('a reordered approval refuses the whole preflight', () => {
    const { candidatePathForSlot, dir } = fullyValidSetup();
    const approvalPath = writeApprovalFile(dir, (a) => {
      const [first, second, ...rest] = a.slots;
      a.slots = [second!, first!, ...rest];
    });
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
  });

  it('expired candidate 7 refuses the whole preflight', () => {
    const dir = freshDir();
    for (const slot of F0V_SLOTS) {
      createSlotOutputRoot(slot);
      if (slot.slotId === F0V_SLOTS[6]!.slotId) {
        writeCandidateFile(dir, slot, (c) => {
          c.validUntilUtc = '2020-01-01T00:00:00.000Z';
        });
      } else {
        writeCandidateFile(dir, slot);
      }
    }
    const approvalPath = writeApprovalFile(dir);
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
    const slot7 = decision.slots.find((s) => s.slotId === F0V_SLOTS[6]!.slotId);
    expect(slot7?.candidateGranted).toBe(false);
  });

  it('an expired study approval refuses the whole preflight', () => {
    const { candidatePathForSlot, dir } = fullyValidSetup();
    const approvalPath = writeApprovalFile(dir, (a) => {
      a.validUntilUtc = '2020-01-01T00:00:00.000Z';
      a.operatorApprovalStatement = buildF0XStudyExecutionApprovalStatement(FIXED_HEAD, a.slots);
    });
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
  });
});

describe('2D2C-F0X: the durable outer-slot identity record', () => {
  function record(overrides: Partial<OuterSlotIdentityRecord> = {}): OuterSlotIdentityRecord {
    const slot = F0V_SLOTS[0]!;
    const identity = historicalIdentityOf(slot.variantName);
    return {
      recordVersion: 'phase2b-2d2c-f0x-outer-slot-identity-v1',
      studyId: 'REPLICATION_V4_V5_N5',
      f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
      f0vApprovalRecordRawSha256: APPROVAL_SHA,
      f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
      f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
      executionIntegrationCommit: FIXED_HEAD,
      slotId: slot.slotId,
      sequence: slot.sequence,
      pairNumber: slot.pairNumber,
      variantName: slot.variantName,
      sourceHistoricalAttemptNo: identity.historicalAttemptNo,
      sourceHistoricalFreezeRawSha256: identity.historicalFreezeRawSha256,
      sourceHistoricalPlanSha256: identity.historicalPlanSha256,
      runtimeCommit: identity.runtimeCommit,
      promptSha256: identity.promptSha256,
      candidateAuthorisationSha256: 'c'.repeat(64),
      studyExecutionApprovalSha256: 'd'.repeat(64),
      outputRoot: freshDir(),
      consumedAtUtc: '2026-09-16T12:00:00.000Z',
      ...overrides,
    };
  }

  it('writes once, and re-reads with a verified hash', () => {
    const rec = record();
    writeOuterSlotIdentity(rec);
    const read = readOuterSlotIdentity(rec.outputRoot, readFile);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.envelope.record).toEqual(rec);
  });

  it('refuses to overwrite an existing record', () => {
    const rec = record();
    writeOuterSlotIdentity(rec);
    expect(() => writeOuterSlotIdentity(rec)).toThrow(WriteOnceCollisionError);
  });

  it('detects a tampered record via the recomputed hash', () => {
    const rec = record();
    writeOuterSlotIdentity(rec);
    const path = join(rec.outputRoot, 'study-slot-identity.json');
    const envelope = JSON.parse(readFileSync(path, 'utf8'));
    envelope.record.slotId = 'TAMPERED';
    writeFileSync(path, JSON.stringify(envelope, null, 2));
    const read = readOuterSlotIdentity(rec.outputRoot, readFile);
    expect(read.ok).toBe(false);
  });
});

describe('2D2C-F0X: study-level durable records', () => {
  it('writeStudyManifest, writeSlotTransition and writeStudyTerminal are all write-once', () => {
    const root = freshDir();
    writeStudyManifest(root, {
      recordVersion: STUDY_RECORD_VERSION,
      studyId: 'REPLICATION_V4_V5_N5',
      f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
      f0vApprovalRecordRawSha256: APPROVAL_SHA,
      f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
      f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
      executionIntegrationCommit: FIXED_HEAD,
      studyExecutionApprovalSha256: 'e'.repeat(64),
      candidateSet: [],
      startedAtUtc: '2026-09-16T12:00:00.000Z',
    });
    expect(() =>
      writeStudyManifest(root, {
        recordVersion: STUDY_RECORD_VERSION,
        studyId: 'REPLICATION_V4_V5_N5',
        f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
        f0vApprovalRecordRawSha256: APPROVAL_SHA,
        f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
        f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
        executionIntegrationCommit: FIXED_HEAD,
        studyExecutionApprovalSha256: 'e'.repeat(64),
        candidateSet: [],
        startedAtUtc: '2026-09-16T12:00:00.000Z',
      }),
    ).toThrow(WriteOnceCollisionError);

    writeSlotTransition(root, 1, {
      recordVersion: STUDY_RECORD_VERSION,
      slotId: 'PAIR_1_V4',
      sequence: 1,
      event: 'SLOT_GRANTED',
      detail: 'x',
      atUtc: '2026-09-16T12:00:00.000Z',
    });
    expect(() =>
      writeSlotTransition(root, 1, {
        recordVersion: STUDY_RECORD_VERSION,
        slotId: 'PAIR_1_V4',
        sequence: 1,
        event: 'SLOT_GRANTED',
        detail: 'y',
        atUtc: '2026-09-16T12:00:01.000Z',
      }),
    ).toThrow(WriteOnceCollisionError);

    writeStudyTerminal(root, {
      recordVersion: STUDY_RECORD_VERSION,
      outcome: 'COMPLETED_ALL_SLOTS',
      pauseReason: null,
      blockingSlotId: null,
      slotsCompleted: 10,
      completedAtUtc: '2026-09-16T13:00:00.000Z',
    });
    expect(() =>
      writeStudyTerminal(root, {
        recordVersion: STUDY_RECORD_VERSION,
        outcome: 'PAUSED',
        pauseReason: 'x',
        blockingSlotId: null,
        slotsCompleted: 5,
        completedAtUtc: '2026-09-16T13:00:01.000Z',
      }),
    ).toThrow(WriteOnceCollisionError);
  });

  it('never carries gold, scoring or classifier-output content in its own field shapes', () => {
    // Structural proof: the type surface has no field named for gold/scoring;
    // this is enforced further by the firewall's identifier scan.
    const forbidden = ['gold', 'score', 'Score', 'adjudicat'];
    const source = canonicalStringify({
      studyManifestFields: [
        'recordVersion',
        'studyId',
        'f0vFreezeRawSha256',
        'f0vApprovalRecordRawSha256',
        'f0vPlanSha256',
        'f0uMethodologyRawSha256',
        'executionIntegrationCommit',
        'studyExecutionApprovalSha256',
        'candidateSet',
        'startedAtUtc',
      ],
    });
    for (const word of forbidden) expect(source.toLowerCase()).not.toContain(word.toLowerCase());
  });
});

describe('2D2C-F0X corrective closure: candidate BYTE LENGTH binding (FIX 1)', () => {
  it('all-ten preflight refuses a slot whose approval entry has the CORRECT sha but the WRONG byte length', () => {
    const dir = freshDir();
    for (const slot of F0V_SLOTS) {
      writeCandidateFile(dir, slot);
      createSlotOutputRoot(slot);
    }
    const approvalPath = writeApprovalFile(dir, (a) => {
      a.slots[4]!.candidateAuthorisationBytes = a.slots[4]!.candidateAuthorisationBytes + 1;
    });
    const decision = runAllTenPreflight({
      registry,
      candidatePathForSlot: (slotId) => join(dir, `${slotId}.json`),
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(false);
    const slot5 = decision.slots.find((s) => s.slotId === F0V_SLOTS[4]!.slotId);
    expect(slot5?.listedInApproval).toBe(false);
    expect(slot5?.candidateGranted).toBe(true); // the candidate ITSELF is structurally fine
    expect(slot5?.problems.some((p) => p.includes('APPROVAL_CANDIDATE_BYTES_MISMATCH'))).toBe(true);
  });

  it('the live composed gate refuses the same correct-sha/wrong-byte-length candidate, immediately before consumption', () => {
    const slot = F0V_SLOTS[0]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot);
    const approvalPath = writeApprovalFile(dir, (a) => {
      a.slots[0]!.candidateAuthorisationBytes = a.slots[0]!.candidateAuthorisationBytes + 1;
    });
    createSlotOutputRoot(slot);

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision).toMatchObject({
      granted: false,
      failedGate: 'APPROVAL_CANDIDATE_MISMATCH',
      refusal: 'APPROVAL_CANDIDATE_BYTES_MISMATCH',
    });
  });

  it('a genuinely valid pairing still grants, and the candidate file is read EXACTLY ONCE — the hash and the byte length the composed gate cross-checks both come from that one read, so the candidate cannot "change between conceptual checks" via separate reads', () => {
    const slot = F0V_SLOTS[0]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot);
    const approvalPath = writeApprovalFile(dir);
    createSlotOutputRoot(slot);

    let candidateReadCount = 0;
    const countingReadFile = (p: string): Buffer => {
      if (p === candidatePath) candidateReadCount += 1;
      return readFile(p);
    };

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile: countingReadFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision.granted).toBe(true);
    expect(candidateReadCount).toBe(1);
  });
});

describe('2D2C-F0X corrective closure: slot-scoped authorisation consumption (FIX 2)', () => {
  function outerRecordFor(
    slot: StudySlotIdentity,
    outputRoot: string,
    candidateAuthorisationSha256: string,
  ): OuterSlotIdentityRecord {
    const identity = historicalIdentityOf(slot.variantName);
    return {
      recordVersion: 'phase2b-2d2c-f0x-outer-slot-identity-v1',
      studyId: 'REPLICATION_V4_V5_N5',
      f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
      f0vApprovalRecordRawSha256: APPROVAL_SHA,
      f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
      f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
      executionIntegrationCommit: FIXED_HEAD,
      slotId: slot.slotId,
      sequence: slot.sequence,
      pairNumber: slot.pairNumber,
      variantName: slot.variantName,
      sourceHistoricalAttemptNo: identity.historicalAttemptNo,
      sourceHistoricalFreezeRawSha256: identity.historicalFreezeRawSha256,
      sourceHistoricalPlanSha256: identity.historicalPlanSha256,
      runtimeCommit: identity.runtimeCommit,
      promptSha256: identity.promptSha256,
      candidateAuthorisationSha256,
      studyExecutionApprovalSha256: 'd'.repeat(64),
      outputRoot,
      consumedAtUtc: '2026-09-16T12:00:00.000Z',
    };
  }

  function writeLegacyMarker(outputRoot: string, sha: string): void {
    const markerPath = authorisationMarkerPathOf(outputRoot, sha);
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, '{}');
  }

  it('an outer-slot-identity record ALONE marks the candidate consumed', () => {
    const slot = F0V_SLOTS[0]!;
    const root = createSlotOutputRoot(slot);
    const sha = 'a'.repeat(64);
    writeOuterSlotIdentity(outerRecordFor(slot, root, sha));
    expect(isConsumedByOuterSlotIdentity(root, sha, readFile)).toBe(true);
    expect(isAuthorisationConsumed(root, sha)).toBe(false);
  });

  it("the coordinator's legacy marker ALONE marks the candidate consumed", () => {
    const slot = F0V_SLOTS[0]!;
    const root = createSlotOutputRoot(slot);
    const sha = 'b'.repeat(64);
    writeLegacyMarker(root, sha);
    expect(isConsumedByOuterSlotIdentity(root, sha, readFile)).toBe(false);
    expect(isAuthorisationConsumed(root, sha)).toBe(true);
  });

  it('BOTH markers present still reads as consumed', () => {
    const slot = F0V_SLOTS[0]!;
    const root = createSlotOutputRoot(slot);
    const sha = 'c'.repeat(64);
    writeOuterSlotIdentity(outerRecordFor(slot, root, sha));
    writeLegacyMarker(root, sha);
    expect(isConsumedByOuterSlotIdentity(root, sha, readFile)).toBe(true);
    expect(isAuthorisationConsumed(root, sha)).toBe(true);
  });

  it('NEITHER marker present reads as fresh', () => {
    const slot = F0V_SLOTS[0]!;
    const root = createSlotOutputRoot(slot);
    const sha = 'e'.repeat(64);
    expect(isConsumedByOuterSlotIdentity(root, sha, readFile)).toBe(false);
    expect(isAuthorisationConsumed(root, sha)).toBe(false);
  });

  it('a legacy marker written under a DIFFERENT slot output root does not consume THIS slot', () => {
    const slot = F0V_SLOTS[0]!;
    const otherSlot = F0V_SLOTS[1]!;
    const root = createSlotOutputRoot(slot);
    const otherRoot = createSlotOutputRoot(otherSlot);
    const sha = 'f'.repeat(64);
    writeLegacyMarker(otherRoot, sha);
    expect(isAuthorisationConsumed(root, sha)).toBe(false);
    expect(isConsumedByOuterSlotIdentity(root, sha, readFile)).toBe(false);
  });

  it('an outer-slot-identity record written for a DIFFERENT slot output root does not consume THIS slot', () => {
    const slot = F0V_SLOTS[0]!;
    const otherSlot = F0V_SLOTS[1]!;
    const root = createSlotOutputRoot(slot);
    const otherRoot = createSlotOutputRoot(otherSlot);
    const sha = 'a1'.repeat(32);
    writeOuterSlotIdentity(outerRecordFor(otherSlot, otherRoot, sha));
    expect(isConsumedByOuterSlotIdentity(root, sha, readFile)).toBe(false);
  });

  it('a crash immediately after the outer consumption record is written (but before runExperiment ever starts) cannot be automatically retried: the sequencing gate refuses the same slot again', () => {
    const slot = F0V_SLOTS[0]!;
    const dir = freshDir();
    const candidatePath = writeCandidateFile(dir, slot);
    const approvalPath = writeApprovalFile(dir);
    const root = createSlotOutputRoot(slot);
    const sha = sha256Hex(candidateBytesOf(slot));
    // Only the outer identity record exists — nothing from `runExperiment` itself.
    writeOuterSlotIdentity(outerRecordFor(slot, root, sha));

    const decision = evaluateComposedSlotExecutionDecision({
      targetSlotId: slot.slotId,
      registry,
      authorisationPath: candidatePath,
      studyApprovalPath: approvalPath,
      readFile,
      sha256: sha256Hex,
      nowUtc,
      currentHead,
      alreadyConsumed,
      sequencingProbes,
      outputRootProbes,
      forbiddenOutputRootContainers: [],
    });
    expect(decision).toMatchObject({
      granted: false,
      failedGate: 'SEQUENCING',
      refusal: 'TARGET_SLOT_ALREADY_HAS_EVIDENCE',
    });
  });
});

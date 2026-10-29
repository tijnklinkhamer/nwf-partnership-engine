/**
 * PHASE 2B-2D2C-F0X RECOVERY-1 — the REAL pinned overlay, the REAL preserved
 * failed study, and the recovery CLI surface.
 *
 * Unmocked: `F0V_STUDY_ROOT` is the real frozen root, which holds the
 * preserved zero-inference study. Nothing here writes anywhere; the real
 * failed study root and control root are re-hashed before and after.
 *
 * Machine-local proofs (`runIf` the preserved roots exist): the failed study
 * re-inventories to exactly the overlay's evidence, and every one of the ten
 * REAL spent candidates — and the REAL failed study approval — is refused by
 * the recovery-1 lock/approval.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { snapshotTreeSha256 } from '../helpers/treeSnapshot.js';
import { F0V_FREEZE_PATH, F0V_STUDY_ROOT } from '../harness/phase2b2d2c/f0v/freezeF0V.js';
import {
  F0V_SLOTS,
  futureOutputRootPathOf,
  sha256Hex,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import { historicalIdentityOf } from '../harness/phase2b2d2c/f0w/slotExecutionPlan.js';
import { loadStudySlotRegistry } from '../harness/phase2b2d2c/f0w/slotRegistry.js';
import {
  createRecovery1PreflightProbes,
  forbiddenOutputRootContainersFor,
  parseF0XCliArgs,
  runF0XCli,
} from '../harness/phase2b2d2c/f0x/cliF0X.js';
import {
  buildRecovery1SlotCandidate,
  buildRecovery1StudyApprovalCandidate,
  recovery1FileBytes,
} from '../harness/phase2b2d2c/f0x/materialiseRecovery1.js';
import {
  evaluateF0XRecovery1SlotExecutionLock,
  evaluateF0XRecovery1StudyExecutionApproval,
} from '../harness/phase2b2d2c/f0x/recovery1Authority.js';
import {
  F0X_CORRECTED_IMPLEMENTATION_COMMIT,
  F0X_RECOVERY_1_CONTROL_DIR,
  F0X_RECOVERY_1_OVERLAY_PATH,
  F0X_RECOVERY_1_OVERLAY_RAW_SHA256,
  F0X_RECOVERY_1_STUDY_ROOT,
  loadRecovery1OverlayFromBytes,
  Recovery1OverlayError,
} from '../harness/phase2b2d2c/f0x/recovery1Overlay.js';
import { failedStudyImmutabilityProblems } from '../harness/phase2b2d2c/f0x/recovery1Preflight.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FAILED_ROOT = '/Users/tijnklinkhamer/Developer/phase2b-2d2c-dev-runs/replication-v4-v5-n5';
const FAILED_CONTROL = `${FAILED_ROOT}-control`;
const FAILED_ROOT_AT_LOAD = snapshotTreeSha256(FAILED_ROOT);
const FAILED_CONTROL_AT_LOAD = snapshotTreeSha256(FAILED_CONTROL);
const FAILED_STUDY_PRESENT = existsSync(FAILED_ROOT) && existsSync(FAILED_CONTROL);

const overlayBytes = readFileSync(join(ROOT, F0X_RECOVERY_1_OVERLAY_PATH));
const binding = loadRecovery1OverlayFromBytes(overlayBytes);
const registry = loadStudySlotRegistry(readFileSync(join(ROOT, F0V_FREEZE_PATH)));

afterAll(() => {
  expect(snapshotTreeSha256(FAILED_ROOT)).toEqual(FAILED_ROOT_AT_LOAD);
  expect(snapshotTreeSha256(FAILED_CONTROL)).toEqual(FAILED_CONTROL_AT_LOAD);
});

describe('2D2C-F0X recovery-1: the pinned overlay binds exactly the owner-approved recovery', () => {
  it('loads only from its pinned bytes and names the approved namespace, the corrected commit and the frozen F0V root as the FAILED root', () => {
    expect(sha256Hex(overlayBytes)).toBe(F0X_RECOVERY_1_OVERLAY_RAW_SHA256);
    const { overlay } = binding;
    expect(overlay.recoveryNamespace).toEqual({
      studyRoot: F0X_RECOVERY_1_STUDY_ROOT,
      controlDir: F0X_RECOVERY_1_CONTROL_DIR,
    });
    expect(F0X_RECOVERY_1_STUDY_ROOT).toBe(`${FAILED_ROOT}-recovery-1`);
    expect(F0X_RECOVERY_1_CONTROL_DIR).toBe(`${FAILED_ROOT}-recovery-1-control`);
    expect(overlay.failedStudy.studyRoot).toBe(F0V_STUDY_ROOT);
    expect(overlay.failedStudy.controlRoot).toBe(FAILED_CONTROL);
    expect(overlay.correctedExecution.correctedImplementationCommit).toBe(
      F0X_CORRECTED_IMPLEMENTATION_COMMIT,
    );
    expect(F0X_CORRECTED_IMPLEMENTATION_COMMIT).toBe('922939cecd100c13e772fec03f23377552df1aab');
    expect(overlay.failedStudy).toMatchObject({
      wholeStudyTree: {
        fileCount: 122,
        treeSha256: '5034ccbded9f0d82beee4e11bb711e84591bb8963dff8d63610c66502ebb3412',
      },
      inventoryRawSha256: '1371cd669fe463b7e785637542c8f95519a13fd11dfbe60ef18a4bf52031d3ee',
      erratumRawSha256: 'de4c10e0af8e9ca97e3ed0d5070f74b5ed9b6dc0c321fbbeb28f700b1f101614',
      studyExecutionApprovalSha256:
        '86f904464e16ce7a1ca2b6ca3862fb6427bf2c20f74688956c7248ff5fc6c9d9',
      providerRequestsObserved: 0,
      adapterAttemptsObserved: 0,
      replicatesContributedTowardN: 0,
    });
    expect(overlay.ownerDecision).toMatchObject({
      amendsSemanticF0VDesign: false,
      authorisesExecution: false,
    });
  });

  it('maps each frozen slot one-to-one onto the committed erratum: same slot, same spent candidate, same failed preflight/tree, Class B, recovery root = the erratum’s proposed replacement', () => {
    const erratumBytes = readFileSync(
      join(ROOT, 'docs/evaluation/PHASE_2B_2D2C_F0X_FAILED_STUDY_ERRATUM_V1.json'),
    );
    expect(sha256Hex(erratumBytes)).toBe(binding.overlay.failedStudy.erratumRawSha256);
    const erratum = JSON.parse(erratumBytes.toString('utf8')) as {
      slots: {
        slotId: string;
        failedOutputRoot: string;
        spentCandidateAuthorisationSha256: string;
        failedSlotTreeSha256: string;
        childPreflight: { fileSha256: string; recordSha256: string };
        proposedReplacementOutputRoot: string;
      }[];
    };
    expect(binding.overlay.slotMapping.map((entry) => entry.slotId)).toEqual(
      F0V_SLOTS.map((slot) => slot.slotId),
    );
    for (const [index, entry] of binding.overlay.slotMapping.entries()) {
      const slot = F0V_SLOTS[index]!;
      const erratumSlot = erratum.slots[index]!;
      expect(entry).toEqual({
        slotId: slot.slotId,
        sequence: slot.sequence,
        variantName: slot.variantName,
        failedOutputRoot: futureOutputRootPathOf(FAILED_ROOT, slot),
        recoveryOutputRoot: futureOutputRootPathOf(F0X_RECOVERY_1_STUDY_ROOT, slot),
        spentCandidateAuthorisationSha256: erratumSlot.spentCandidateAuthorisationSha256,
        failedChildPreflightFileSha256: erratumSlot.childPreflight.fileSha256,
        failedChildPreflightRecordSha256: erratumSlot.childPreflight.recordSha256,
        failedSlotTreeSha256: erratumSlot.failedSlotTreeSha256,
        failedDisposition: 'CLASS_B_AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
        failedSlotCountsTowardN: false,
      });
      expect(erratumSlot.proposedReplacementOutputRoot).toBe(entry.recoveryOutputRoot);
    }
  });

  it('refuses any other bytes — a single changed byte, or a reformatted but equivalent document', () => {
    const tampered = Buffer.from(overlayBytes);
    tampered[tampered.length - 3] = tampered[tampered.length - 3]! ^ 1;
    expect(() => loadRecovery1OverlayFromBytes(tampered)).toThrow(Recovery1OverlayError);
    const reformatted = Buffer.from(JSON.stringify(JSON.parse(overlayBytes.toString('utf8'))));
    expect(() => loadRecovery1OverlayFromBytes(reformatted)).toThrow(/pinned/);
  });

  it('the failed study root and its control root are forbidden output-root containers in EVERY mode, and recovery-1 also forbids its own control directory', () => {
    const original = forbiddenOutputRootContainersFor(ROOT, null);
    expect(original).toEqual(expect.arrayContaining([ROOT, FAILED_ROOT, FAILED_CONTROL]));
    const recovery = forbiddenOutputRootContainersFor(ROOT, binding);
    expect(recovery).toEqual(
      expect.arrayContaining([ROOT, FAILED_ROOT, FAILED_CONTROL, F0X_RECOVERY_1_CONTROL_DIR]),
    );
    expect(recovery).not.toContain(F0X_RECOVERY_1_STUDY_ROOT);
  });

  it('a candidate and approval built from the real overlay verify against the real overlay (statement, recoveryOf, roots)', () => {
    const now = new Date('2026-09-16T12:00:00.000Z');
    const readFile = (): Buffer => bytesByPath;
    let bytesByPath: Buffer = Buffer.alloc(0);
    for (const slot of F0V_SLOTS) {
      bytesByPath = recovery1FileBytes(
        buildRecovery1SlotCandidate(
          binding,
          slot,
          '2026-09-16T00:00:00.000Z',
          '2026-09-17T00:00:00.000Z',
        ),
      );
      const decision = evaluateF0XRecovery1SlotExecutionLock(binding, {
        executeFlag: true,
        authorisationPath: '/virtual/candidate.json',
        expected: {
          slotId: slot.slotId,
          outputRoot: futureOutputRootPathOf(F0X_RECOVERY_1_STUDY_ROOT, slot),
          attemptNo: historicalIdentityOf(slot.variantName).historicalAttemptNo,
        },
        readFile,
        sha256: sha256Hex,
        alreadyConsumed: () => false,
        nowUtc: () => now,
        resolveSlot: (slotId) => registry.resolveSlot(slotId),
      });
      expect(decision).toMatchObject({ granted: true });
    }
  });
});

describe.runIf(FAILED_STUDY_PRESENT)(
  '2D2C-F0X recovery-1 TRIPWIRE (machine-local): the REAL preserved failed study',
  () => {
    it('re-inventories request-free to exactly the evidence the overlay binds (tree 5034ccbd…, inventory, erratum, ten Class B, zero requests)', () => {
      expect(
        failedStudyImmutabilityProblems(binding, ROOT, createRecovery1PreflightProbes(ROOT)),
      ).toEqual([]);
    });

    it('every one of the ten REAL spent candidates is refused as SPENT_CANDIDATE_PRESENTED by the recovery-1 lock', () => {
      for (const slot of F0V_SLOTS) {
        const path = join(FAILED_CONTROL, 'candidates', `${slot.slotId}.json`);
        const decision = evaluateF0XRecovery1SlotExecutionLock(binding, {
          executeFlag: true,
          authorisationPath: path,
          expected: {
            slotId: slot.slotId,
            outputRoot: futureOutputRootPathOf(F0X_RECOVERY_1_STUDY_ROOT, slot),
            attemptNo: historicalIdentityOf(slot.variantName).historicalAttemptNo,
          },
          readFile: (p) => readFileSync(p),
          sha256: (bytes) => createHash('sha256').update(bytes).digest('hex'),
          alreadyConsumed: () => false,
          nowUtc: () => new Date('2026-09-16T12:00:00.000Z'),
          resolveSlot: (slotId) => registry.resolveSlot(slotId),
        });
        expect(decision).toMatchObject({ granted: false, refusal: 'SPENT_CANDIDATE_PRESENTED' });
      }
    });

    it('the REAL failed study approval is refused as FAILED_STUDY_APPROVAL_PRESENTED', () => {
      const decision = evaluateF0XRecovery1StudyExecutionApproval(binding, {
        approvalPath: join(FAILED_CONTROL, 'F0X_STUDY_EXECUTION_APPROVAL_CANDIDATE_74ee8a4.json'),
        readFile: (p) => readFileSync(p),
        sha256: sha256Hex,
        nowUtc: () => new Date('2026-09-16T12:00:00.000Z'),
        currentHead: () => '74ee8a445da02d80a8b5d73e651bbde9a2a97115',
      });
      expect(decision).toMatchObject({
        granted: false,
        refusal: 'FAILED_STUDY_APPROVAL_PRESENTED',
      });
    });

    it('an approval listing a real spent hash is refused as SPENT_CANDIDATE_LISTED even with a valid recovery block and statement', () => {
      const spentBytes = readFileSync(join(FAILED_CONTROL, 'candidates', 'PAIR_1_V4.json'));
      const candidates = F0V_SLOTS.map((slot, index) => ({
        slot,
        bytes:
          index === 0
            ? spentBytes
            : recovery1FileBytes(
                buildRecovery1SlotCandidate(
                  binding,
                  slot,
                  '2026-09-16T00:00:00.000Z',
                  '2026-09-17T00:00:00.000Z',
                ),
              ),
      }));
      const approvalBytes = recovery1FileBytes(
        buildRecovery1StudyApprovalCandidate(
          binding,
          'a'.repeat(40),
          candidates,
          '2026-09-16T00:00:00.000Z',
          '2026-09-17T00:00:00.000Z',
        ),
      );
      const decision = evaluateF0XRecovery1StudyExecutionApproval(binding, {
        approvalPath: '/virtual/approval.json',
        readFile: () => approvalBytes,
        sha256: sha256Hex,
        nowUtc: () => new Date('2026-09-16T12:00:00.000Z'),
        currentHead: () => 'a'.repeat(40),
      });
      expect(decision).toMatchObject({ granted: false, refusal: 'SPENT_CANDIDATE_LISTED' });
    });
  },
);

describe('2D2C-F0X recovery-1 CLI: a boolean mode, never a path; control-plane paths confined to the recovery control directory', () => {
  it('parses --recovery-1 as a boolean and still refuses every slot-order/output-root escape', () => {
    expect(parseF0XCliArgs(['--recovery-1']).recovery1).toBe(true);
    expect(parseF0XCliArgs([]).recovery1).toBe(false);
    for (const escape of ['--study-root', '--recovery-root', '--output-root', '--start-at']) {
      expect(() => parseF0XCliArgs(['--recovery-1', escape, '/x'])).toThrow(/unknown argument/);
    }
  });

  it.each([
    [
      'a candidate set in the FAILED control directory',
      ['--candidate-set', join(FAILED_CONTROL, 'candidates')],
    ],
    [
      'a study approval in the FAILED control directory',
      ['--study-approval', join(FAILED_CONTROL, 'x.json')],
    ],
    ['the recovery control directory itself', ['--candidate-set', F0X_RECOVERY_1_CONTROL_DIR]],
    ['a relative path', ['--study-approval', 'approval.json']],
    [
      'a path under the recovery STUDY root',
      ['--candidate-set', join(F0X_RECOVERY_1_STUDY_ROOT, 'pair-1-v4')],
    ],
  ])('refuses %s with exit 2, before any preflight', async (_name, extra) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runF0XCli(['--recovery-1', ...extra], {
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      env: {},
      nowUtc: () => new Date('2026-09-16T12:00:00.000Z'),
      launcher: {
        launch: () => {
          throw new Error('no launch in a refused CLI invocation');
        },
      },
    });
    expect(code).toBe(2);
    expect(out).toEqual([]);
    expect(err.join('')).toContain('inside the recovery control directory');
  });
});

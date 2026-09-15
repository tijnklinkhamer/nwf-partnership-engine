/**
 * PHASE 2B-2D2C-F0W — V4/V5 N=5 REPLICATION-STUDY READINESS / CONTROL-PLANE
 * PREPARATION. REQUEST-FREE, ZERO INFERENCE.
 *
 * Proves the F0W machinery this task adds is mechanically ready, against
 * REAL committed bytes (the approved F0V freeze and its owner-approval
 * record, the approved F0I/F0O freezes) and against a REAL physical Tier-2
 * child process boundary for BOTH replication variants, exactly as F0P
 * proved attempt-4 readiness and F0K proved attempt-3 readiness:
 *
 *   1. the slot registry resolves exactly the ten frozen slots, in order,
 *      from the real F0V freeze bytes;
 *   2. the two-layer identity bridge (`slotExecutionPlan.ts`) reuses the
 *      historical F0I (attempt 3, V4) / F0O (attempt 4, V5) plan and
 *      `attemptNo` UNCHANGED for every slot of that variant, scoped only by
 *      the slot's own distinct future output root;
 *   3. the per-slot execution lock: a structurally valid candidate for
 *      PAIR_1_V4 and for PAIR_1_V5 is GRANTED, and every mutation this
 *      task's negative-test matrix names is refused;
 *   4. the study-level execution-approval schema: a structurally valid
 *      ten-slot candidate is GRANTED, and every mutation is refused;
 *   5. the sequencing gate never allows a slot to start out of order, never
 *      skips a paused (Class B) or ambiguous prior slot, and only allows
 *      progression past a Class C prior slot once it is durably closed;
 *   6. the coordinator -> child boundary, over a REAL slot-derived plan for
 *      BOTH V4 and V5, against a fake launcher: all twelve children are
 *      built and launched;
 *   7. the same thing at PROCESS level through the real Tier-2 child entry,
 *      for BOTH V4 and V5, which stops at its own preflight against a
 *      non-frozen root - before any provider import - so no authentication
 *      or network path is reachable for either variant;
 *   8. output-root readiness: the frozen study root and all ten frozen slot
 *      roots are currently absent on this machine, and the readiness CLI
 *      reports READY against real bytes with no root created.
 *
 * No provider, no network, no database, no clock outside the injected ones.
 * Everything empirical is written under scratch directories; nothing is
 * ever written under the real frozen study root, which this suite only
 * ever INSPECTS.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  attemptDirectoryOf,
  readArtifact,
  validateOutputRoot,
  writeArtifactOnce,
  type ArtifactKind,
} from '../harness/phase2b2d2c/artifacts.js';
import {
  authorisationMarkerPathOf,
  runExperiment,
  type ChildLaunchInput,
  type ChildLauncher,
  type ExperimentInput,
} from '../harness/phase2b2d2c/coordinator.js';
import {
  ATTEMPT4_AUTHORISATION_VERSION,
  ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
  ATTEMPT4_MAX_PROVIDER_REQUESTS,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
} from '../harness/phase2b2d2c/f0o/authorisationF0O.js';
import { CHILD_ENTRY_PATH } from '../harness/phase2b2d2c/f0o/cliF0O.js';
import {
  buildF0OExecutionPlan,
  F0O_FREEZE_PATH,
  loadF0OFreezeFromBytes,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  buildF0IExecutionPlan,
  F0I_FREEZE_PATH,
  loadF0IFreezeFromBytes,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import {
  buildF0WSlotAuthorisationStatement,
  evaluateF0WSlotExecutionLock,
  F0W_SLOT_AUTHORISATION_VERSION,
  F0WSlotAuthorisationSchema,
  verifyF0WSlotAuthorisationCandidate,
  type F0WSlotExecutionAuthorisation,
  type F0WSlotExecutionLockInput,
} from '../harness/phase2b2d2c/f0w/authorisationF0W.js';
import {
  buildReadinessReport,
  parseF0WCliArgs,
  RUNNER_REPO_ROOT,
} from '../harness/phase2b2d2c/f0w/cliF0W.js';
import {
  inspectStudyRootReadiness,
  slotOutputRootsAreUnique,
  validateSlotOutputRootForExecution,
} from '../harness/phase2b2d2c/f0w/outputRootReadiness.js';
import {
  classifySlotEvidence,
  evaluateSequencingGate,
  inclusionClassOf,
  type SlotEvidenceProbes,
} from '../harness/phase2b2d2c/f0w/sequencing.js';
import {
  buildSlotExecutionPlanTemplate,
  historicalIdentityOf,
  SlotExecutionPlanError,
} from '../harness/phase2b2d2c/f0w/slotExecutionPlan.js';
import {
  loadStudySlotRegistry,
  SlotRegistryError,
} from '../harness/phase2b2d2c/f0w/slotRegistry.js';
import {
  approvalListsCandidate,
  buildF0WStudyExecutionApprovalStatement,
  F0W_STUDY_EXECUTION_APPROVAL_VERSION,
  verifyF0WStudyExecutionApprovalCandidate,
  type F0WStudyExecutionApproval,
} from '../harness/phase2b2d2c/f0w/studyExecutionApproval.js';
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
  F0V_TOTAL_SLOTS,
  futureOutputRootPathOf,
} from '../harness/phase2b2d2c/f0v/studyPlanCore.js';
import { sha256Hex } from '../harness/phase2b2d2c/freeze.js';
import { runProcessIsolatedBatch } from '../harness/processIsolatedBatch.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0V_BYTES = readFileSync(join(ROOT, F0V_FREEZE_PATH));
const F0I_BYTES = readFileSync(join(ROOT, F0I_FREEZE_PATH));
const F0O_BYTES = readFileSync(join(ROOT, F0O_FREEZE_PATH));
const REGISTRY = loadStudySlotRegistry(F0V_BYTES);
const F0I_LOADED = loadF0IFreezeFromBytes(F0I_BYTES);
const F0O_LOADED = loadF0OFreezeFromBytes(F0O_BYTES);
const F0I_PLAN = buildF0IExecutionPlan(F0I_LOADED.freeze, F0I_LOADED.rawSha256);
const F0O_PLAN = buildF0OExecutionPlan(F0O_LOADED.freeze, F0O_LOADED.rawSha256);
const IS_WINDOWS = process.platform === 'win32';
const NOW = new Date('2026-09-15T12:00:00Z');

const PAIR_1_V4 = REGISTRY.resolveSlot('PAIR_1_V4');
const PAIR_1_V5 = REGISTRY.resolveSlot('PAIR_1_V5');
const PAIR_2_V4 = REGISTRY.resolveSlot('PAIR_2_V4');

const SCRATCH = realpathSync.native(mkdtempSync(join(tmpdir(), 'nwf-pe-2d2c-f0w-')));
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }));
let counter = 0;
function scratchDir(prefix: string): string {
  counter += 1;
  const dir = join(SCRATCH, `${prefix}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const record = <T>(dir: string, kind: ArtifactKind): T | null => {
  const read = readArtifact<T>(dir, kind);
  return read.ok ? read.envelope.record : null;
};

// ---------------------------------------------------------------------------
// 1. Real production pins.
// ---------------------------------------------------------------------------

describe('2D2C-F0W: real production pins are non-null and match the frozen registry', () => {
  it('the F0V approval record and F0U methodology hashes are pinned (non-null)', () => {
    expect(F0V_APPROVAL_RECORD_RAW_SHA256).not.toBeNull();
    expect(F0U_METHODOLOGY_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the registry resolves exactly the ten frozen slots, in frozen order', () => {
    expect(REGISTRY.slots).toEqual(F0V_SLOTS);
    expect(REGISTRY.totalSlots).toBe(F0V_TOTAL_SLOTS);
  });

  it('an unknown slotId is refused by SlotRegistryError', () => {
    expect(() => REGISTRY.resolveSlot('PAIR_6_V4')).toThrow(SlotRegistryError);
  });

  it('the mechanical ceiling is 61 provider requests / 183 adapter attempts, same as attempts 3 and 4', () => {
    expect(ATTEMPT4_MAX_PROVIDER_REQUESTS).toBe(61);
    expect(ATTEMPT4_MAX_ADAPTER_ATTEMPTS).toBe(183);
  });

  it('historicalIdentityOf reuses attempt 3 (F0I) for every V4 slot and attempt 4 (F0O) for every V5 slot, unchanged', () => {
    for (const slot of F0V_SLOTS) {
      const identity = historicalIdentityOf(slot.variantName);
      if (slot.variantName === 'PROMPT_V4_CANONICAL') {
        expect(identity.historicalAttemptNo).toBe(3);
        expect(identity.historicalFreezePath).toBe(F0I_FREEZE_PATH);
      } else {
        expect(identity.historicalAttemptNo).toBe(4);
        expect(identity.historicalFreezePath).toBe(F0O_FREEZE_PATH);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The two-layer identity bridge.
// ---------------------------------------------------------------------------

describe('2D2C-F0W: the two-layer slot identity bridge never invents an attempt number', () => {
  it('every V4 slot gets a DISTINCT output root but the IDENTICAL historical plan and attemptNo 3', () => {
    const v4Slots = F0V_SLOTS.filter((slot) => slot.variantName === 'PROMPT_V4_CANONICAL');
    const templates = v4Slots.map((slot) =>
      buildSlotExecutionPlanTemplate(slot, F0I_PLAN, F0O_PLAN),
    );
    for (const template of templates) {
      expect(template.plan).toBe(F0I_PLAN);
      expect(template.attemptNo).toBe(3);
      expect(template.freezePath).toBe(F0I_FREEZE_PATH);
    }
    expect(new Set(templates.map((t) => t.outputRoot)).size).toBe(templates.length);
  });

  it('every V5 slot gets a DISTINCT output root but the IDENTICAL historical plan and attemptNo 4', () => {
    const v5Slots = F0V_SLOTS.filter((slot) => slot.variantName === 'PROMPT_V5_CANONICAL');
    const templates = v5Slots.map((slot) =>
      buildSlotExecutionPlanTemplate(slot, F0I_PLAN, F0O_PLAN),
    );
    for (const template of templates) {
      expect(template.plan).toBe(F0O_PLAN);
      expect(template.attemptNo).toBe(4);
      expect(template.freezePath).toBe(F0O_FREEZE_PATH);
    }
    expect(new Set(templates.map((t) => t.outputRoot)).size).toBe(templates.length);
  });

  it("a V4 slot's output root never collides with the identically-attemptNo'd V4 slot next to it in the frozen order", () => {
    const t1 = buildSlotExecutionPlanTemplate(PAIR_1_V4, F0I_PLAN, F0O_PLAN);
    const t2 = buildSlotExecutionPlanTemplate(PAIR_2_V4, F0I_PLAN, F0O_PLAN);
    expect(t1.attemptNo).toBe(t2.attemptNo);
    expect(t1.outputRoot).not.toBe(t2.outputRoot);
    expect(attemptDirectoryOf(t1.outputRoot, 'PROMPT_V4_CANONICAL', 1, t1.attemptNo)).not.toBe(
      attemptDirectoryOf(t2.outputRoot, 'PROMPT_V4_CANONICAL', 1, t2.attemptNo),
    );
  });

  it('refuses a slot/plan pairing whose variant disagrees with the supplied source plan', () => {
    const wrongF0iPlan = {
      ...F0I_PLAN,
      evaluations: [{ ...F0I_PLAN.evaluations[0]!, variantName: 'PROMPT_V9_CANONICAL' }],
    } as unknown as typeof F0I_PLAN;
    expect(() => buildSlotExecutionPlanTemplate(PAIR_1_V4, wrongF0iPlan, F0O_PLAN)).toThrow(
      SlotExecutionPlanError,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The per-slot execution lock: grant, and fail-closed mutation coverage.
// ---------------------------------------------------------------------------

function validSlotAuthorisation(
  slot = PAIR_1_V4,
  overrides: Record<string, unknown> = {},
): F0WSlotExecutionAuthorisation {
  const identity = historicalIdentityOf(slot.variantName);
  return {
    authorisationVersion: F0W_SLOT_AUTHORISATION_VERSION,
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
    maxLogicalEvaluations: 12,
    frozenLogicalBatchOrdinals: Array.from({ length: 12 }, (_, i) => i + 1),
    maxProviderRequests: ATTEMPT4_MAX_PROVIDER_REQUESTS,
    maxAdapterAttempts: ATTEMPT4_MAX_ADAPTER_ATTEMPTS,
    repairPolicy: {
      enabled: true,
      maxRoundsPerLogicalEvaluation: 1,
      minimumRemainingBudgetMs: 120_000,
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
    outputRoot: futureOutputRootPathOf(F0V_STUDY_ROOT, slot),
    issuedAtUtc: '2026-09-15T00:00:00Z',
    validUntilUtc: '2026-09-15T23:59:59Z',
    operatorAuthorisationStatement: buildF0WSlotAuthorisationStatement(slot),
    ...overrides,
  } as F0WSlotExecutionAuthorisation;
}

function bytesOf(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function lockInputFor(
  authorisation: unknown,
  slot = PAIR_1_V4,
  overrides: Partial<F0WSlotExecutionLockInput> = {},
): F0WSlotExecutionLockInput {
  const bytes = bytesOf(authorisation);
  const identity = historicalIdentityOf(slot.variantName);
  return {
    executeFlag: true,
    authorisationPath: '/synthetic/authorisation.json',
    expected: {
      slotId: slot.slotId,
      outputRoot: futureOutputRootPathOf(F0V_STUDY_ROOT, slot),
      attemptNo: identity.historicalAttemptNo,
    },
    readFile: () => bytes,
    sha256: sha256Hex,
    alreadyConsumed: () => false,
    nowUtc: () => NOW,
    resolveSlot: (slotId) => REGISTRY.resolveSlot(slotId),
    ...overrides,
  };
}

describe('2D2C-F0W: a structurally valid per-slot authorisation is GRANTED', () => {
  it('grants PAIR_1_V4', () => {
    const authorisation = validSlotAuthorisation(PAIR_1_V4);
    const parsed = F0WSlotAuthorisationSchema.parse(authorisation);
    expect(parsed).toEqual(authorisation);
    const decision = evaluateF0WSlotExecutionLock(lockInputFor(authorisation, PAIR_1_V4));
    expect(decision.granted).toBe(true);
    if (decision.granted) expect(decision.slot).toEqual(PAIR_1_V4);
  });

  it('grants PAIR_1_V5', () => {
    const authorisation = validSlotAuthorisation(PAIR_1_V5);
    const decision = evaluateF0WSlotExecutionLock(lockInputFor(authorisation, PAIR_1_V5));
    expect(decision.granted).toBe(true);
  });

  it('verifyF0WSlotAuthorisationCandidate reaches the same grant without an executeFlag', () => {
    const authorisation = validSlotAuthorisation(PAIR_1_V4);
    const { executeFlag: _unused, ...withoutFlag } = lockInputFor(authorisation, PAIR_1_V4);
    expect(verifyF0WSlotAuthorisationCandidate(withoutFlag).granted).toBe(true);
  });
});

describe('2D2C-F0W: per-slot lock fail-closed mutation coverage', () => {
  it('EXECUTE_FLAG_ABSENT: no --execute', () => {
    const decision = evaluateF0WSlotExecutionLock({
      ...lockInputFor(validSlotAuthorisation()),
      executeFlag: false,
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'EXECUTE_FLAG_ABSENT' });
  });

  it('AUTHORISATION_PATH_ABSENT: no --authorisation', () => {
    const decision = evaluateF0WSlotExecutionLock({
      ...lockInputFor(validSlotAuthorisation()),
      authorisationPath: null,
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_PATH_ABSENT' });
  });

  it('AUTHORISATION_PATH_NOT_ABSOLUTE: a relative path', () => {
    const decision = evaluateF0WSlotExecutionLock({
      ...lockInputFor(validSlotAuthorisation()),
      authorisationPath: 'relative/authorisation.json',
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_PATH_NOT_ABSOLUTE' });
  });

  it('AUTHORISATION_UNREADABLE: the file cannot be read', () => {
    const decision = evaluateF0WSlotExecutionLock({
      ...lockInputFor(validSlotAuthorisation()),
      readFile: () => {
        throw new Error('ENOENT');
      },
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_UNREADABLE' });
  });

  it('AUTHORISATION_MALFORMED: not valid JSON', () => {
    const decision = evaluateF0WSlotExecutionLock({
      ...lockInputFor(validSlotAuthorisation()),
      readFile: () => Buffer.from('not json', 'utf8'),
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('AUTHORISATION_MALFORMED: an unknown extra key (strict schema)', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({ ...validSlotAuthorisation(), extraField: 'nope' }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('ATTEMPT_1_AUTHORISATION_PRESENTED', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({ authorisationVersion: ATTEMPT_1_AUTHORISATION_VERSION }),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'ATTEMPT_1_AUTHORISATION_PRESENTED',
    });
  });

  it('ATTEMPT_2_AUTHORISATION_PRESENTED', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({ authorisationVersion: ATTEMPT_2_AUTHORISATION_VERSION }),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'ATTEMPT_2_AUTHORISATION_PRESENTED',
    });
  });

  it('ATTEMPT_3_AUTHORISATION_PRESENTED', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({ authorisationVersion: ATTEMPT_3_AUTHORISATION_VERSION }),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'ATTEMPT_3_AUTHORISATION_PRESENTED',
    });
  });

  it('ATTEMPT_4_AUTHORISATION_PRESENTED: an attempt-4 authorisation presented as a replication authorisation', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({ authorisationVersion: ATTEMPT4_AUTHORISATION_VERSION }),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'ATTEMPT_4_AUTHORISATION_PRESENTED',
    });
  });

  it('wrong F0V freeze hash', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { f0vFreezeRawSha256: 'a'.repeat(64) })),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('wrong study-plan hash', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { f0vPlanSha256: 'a'.repeat(64) })),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('wrong F0V approval-record hash: FREEZE_APPROVAL_RECORD_MISMATCH', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(
        validSlotAuthorisation(PAIR_1_V4, { f0vApprovalRecordRawSha256: 'b'.repeat(64) }),
      ),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'FREEZE_APPROVAL_RECORD_MISMATCH' });
  });

  it('wrong F0U methodology hash', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { f0uMethodologyRawSha256: 'c'.repeat(64) })),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('unknown slot: AUTHORISATION_SLOT_UNKNOWN', () => {
    const authorisation = validSlotAuthorisation(PAIR_1_V4, { slotId: 'PAIR_6_V4' });
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(authorisation, PAIR_1_V4, {
        expected: { slotId: 'PAIR_6_V4', outputRoot: '', attemptNo: 3 },
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_SLOT_UNKNOWN' });
  });

  it('candidate for another slot: AUTHORISATION_SLOT_MISMATCH', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4), PAIR_1_V5),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_SLOT_MISMATCH' });
  });

  it('reordered slot: wrong sequence for this slotId', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { sequence: 9 })),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('wrong pair number', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { pairNumber: 5 })),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('wrong variant for slot: a V5 candidate claiming a V4 slotId', () => {
    const authorisation = {
      ...validSlotAuthorisation(PAIR_1_V4),
      variantName: 'PROMPT_V5_CANONICAL',
    };
    const decision = evaluateF0WSlotExecutionLock(lockInputFor(authorisation, PAIR_1_V4));
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('V6/future variant is refused by the closed enum before any registry lookup', () => {
    const authorisation = {
      ...validSlotAuthorisation(PAIR_1_V4),
      variantName: 'PROMPT_V6_CANONICAL',
    };
    const decision = evaluateF0WSlotExecutionLock(lockInputFor(authorisation, PAIR_1_V4));
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('wrong source historical freeze hash', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(
        validSlotAuthorisation(PAIR_1_V4, { sourceHistoricalFreezeRawSha256: 'd'.repeat(64) }),
      ),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('wrong source historical plan hash', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(
        validSlotAuthorisation(PAIR_1_V4, { sourceHistoricalPlanSha256: 'e'.repeat(64) }),
      ),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('wrong runtime commit', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { runtimeCommit: 'f'.repeat(40) })),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('wrong prompt SHA-256', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { promptSha256: 'a'.repeat(64) })),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('a V4 candidate can never validate for a V5 slot, even with every V4 field internally consistent', () => {
    const v4Authorisation = validSlotAuthorisation(PAIR_1_V4);
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({ ...v4Authorisation, slotId: PAIR_1_V5.slotId }, PAIR_1_V5),
    );
    expect(decision.granted).toBe(false);
  });

  it('inflated provider ceiling', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { maxProviderRequests: 999 })),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('inflated adapter ceiling', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { maxAdapterAttempts: 999 })),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('altered ordinal ordering', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(
        validSlotAuthorisation(PAIR_1_V4, {
          frozenLogicalBatchOrdinals: [2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        }),
      ),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it.each([
    'holdout',
    'goldLabelChanges',
    'thresholdChanges',
    'promptChanges',
    'databaseWrites',
    'migrationWrites',
    'v6OrFutureVariantScheduling',
    'otherSlotExecution',
  ] as const)('a non-NONE prohibition (%s) is refused', (key) => {
    const authorisation = validSlotAuthorisation(PAIR_1_V4);
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({
        ...authorisation,
        prohibitions: { ...authorisation.prohibitions, [key]: 'SOME_CHANGE' },
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('HOLDOUT scope requested', () => {
    const authorisation = validSlotAuthorisation(PAIR_1_V4);
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor({
        ...authorisation,
        prohibitions: { ...authorisation.prohibitions, holdout: 'HOLDOUT_ACCESS_REQUESTED' },
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('the authorised output root does not match the frozen root for this slot', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4, { outputRoot: '/wrong/root' })),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
    });
  });

  it("duplicate output root: a candidate naming a DIFFERENT slot's frozen root", () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(
        validSlotAuthorisation(PAIR_1_V4, {
          outputRoot: futureOutputRootPathOf(F0V_STUDY_ROOT, PAIR_2_V4),
        }),
      ),
    );
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
    });
  });

  it('wrong historical attempt number at the CALLER boundary', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4), PAIR_1_V4, {
        expected: {
          slotId: PAIR_1_V4.slotId,
          outputRoot: futureOutputRootPathOf(F0V_STUDY_ROOT, PAIR_1_V4),
          attemptNo: 4,
        },
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_ATTEMPT_MISMATCH' });
  });

  it('expired candidate fixture', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4), PAIR_1_V4, {
        nowUtc: () => new Date('2026-09-16T00:00:00Z'),
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_EXPIRED' });
  });

  it('not-yet-valid candidate fixture', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4), PAIR_1_V4, {
        nowUtc: () => new Date('2026-09-14T00:00:00Z'),
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_NOT_YET_VALID' });
  });

  it('validUntilUtc not after issuedAtUtc', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(
        validSlotAuthorisation(PAIR_1_V4, {
          issuedAtUtc: '2026-09-15T23:59:59Z',
          validUntilUtc: '2026-09-15T00:00:00Z',
        }),
      ),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('already-consumed candidate fixture: AUTHORISATION_ALREADY_CONSUMED', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(validSlotAuthorisation(PAIR_1_V4), PAIR_1_V4, { alreadyConsumed: () => true }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_ALREADY_CONSUMED' });
  });

  it('one changed byte (a mutated statement) is refused before any grant', () => {
    const decision = evaluateF0WSlotExecutionLock(
      lockInputFor(
        validSlotAuthorisation(PAIR_1_V4, {
          operatorAuthorisationStatement: `${buildF0WSlotAuthorisationStatement(PAIR_1_V4)} `,
        }),
      ),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_STATEMENT_MISMATCH' });
  });
});

// ---------------------------------------------------------------------------
// 4. The study-level execution-approval schema.
// ---------------------------------------------------------------------------

function validStudyApproval(overrides: Record<string, unknown> = {}): F0WStudyExecutionApproval {
  const slots = F0V_SLOTS.map((slot, index) => ({
    slotId: slot.slotId,
    sequence: slot.sequence,
    variantName: slot.variantName,
    candidateAuthorisationSha256: sha256Hex(`candidate-${index}`),
    candidateAuthorisationBytes: 1000 + index,
    outputRoot: futureOutputRootPathOf(F0V_STUDY_ROOT, slot),
  }));
  return {
    approvalVersion: F0W_STUDY_EXECUTION_APPROVAL_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: 'REPLICATION_V4_V5_N5',
    f0vFreezeRawSha256: PROPOSED_F0V_FREEZE_RAW_SHA256,
    f0vPlanSha256: PROPOSED_F0V_PLAN_SHA256,
    f0vApprovalRecordRawSha256: F0V_APPROVAL_RECORD_RAW_SHA256 as string,
    f0uMethodologyRawSha256: F0U_METHODOLOGY_RAW_SHA256,
    slots,
    issuedAtUtc: '2026-09-15T00:00:00Z',
    validUntilUtc: '2026-09-15T23:59:59Z',
    operatorApprovalStatement: buildF0WStudyExecutionApprovalStatement(slots),
    ...overrides,
  } as F0WStudyExecutionApproval;
}

function approvalCandidateInput(approval: unknown, overrides: Record<string, unknown> = {}) {
  const bytes = bytesOf(approval);
  return {
    approvalPath: '/synthetic/study-approval.json',
    readFile: () => bytes,
    sha256: sha256Hex,
    nowUtc: () => NOW,
    ...overrides,
  };
}

describe('2D2C-F0W: the study-level execution-approval candidate check', () => {
  it('grants a structurally valid ten-slot candidate', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate(
      approvalCandidateInput(validStudyApproval()),
    );
    expect(decision.granted).toBe(true);
  });

  it('absent future study execution-approval: APPROVAL_PATH_ABSENT', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate({
      approvalPath: null,
      readFile: () => Buffer.from(''),
      sha256: sha256Hex,
      nowUtc: () => NOW,
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_PATH_ABSENT' });
  });

  it('a relative approval path is refused', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate(
      approvalCandidateInput(validStudyApproval(), { approvalPath: 'relative.json' }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_PATH_NOT_ABSOLUTE' });
  });

  it('an unreadable approval path is refused', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate({
      approvalPath: '/synthetic/x.json',
      readFile: () => {
        throw new Error('ENOENT');
      },
      sha256: sha256Hex,
      nowUtc: () => NOW,
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_UNREADABLE' });
  });

  it('malformed JSON is refused', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate({
      approvalPath: '/synthetic/x.json',
      readFile: () => Buffer.from('not json'),
      sha256: sha256Hex,
      nowUtc: () => NOW,
    });
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_MALFORMED' });
  });

  it('wrong F0V approval-record hash', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate(
      approvalCandidateInput(validStudyApproval({ f0vApprovalRecordRawSha256: 'a'.repeat(64) })),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'FREEZE_APPROVAL_RECORD_MISMATCH' });
  });

  it('reordered slot list: APPROVAL_SLOT_ORDER_MISMATCH', () => {
    const approval = validStudyApproval();
    const reordered = { ...approval, slots: [...approval.slots].reverse() };
    const decision = verifyF0WStudyExecutionApprovalCandidate(approvalCandidateInput(reordered));
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_SLOT_ORDER_MISMATCH' });
  });

  it('a slot naming the wrong output root: APPROVAL_SLOT_FIELD_MISMATCH', () => {
    const approval = validStudyApproval();
    const mutated = {
      ...approval,
      slots: approval.slots.map((slot, i) => (i === 0 ? { ...slot, outputRoot: '/wrong' } : slot)),
    };
    const decision = verifyF0WStudyExecutionApprovalCandidate(approvalCandidateInput(mutated));
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_SLOT_FIELD_MISMATCH' });
  });

  it('duplicate candidate hash across two slots: APPROVAL_DUPLICATE_CANDIDATE_HASH', () => {
    const approval = validStudyApproval();
    const mutated = {
      ...approval,
      slots: approval.slots.map((slot, i) =>
        i === 1
          ? {
              ...slot,
              candidateAuthorisationSha256: approval.slots[0]!.candidateAuthorisationSha256,
            }
          : slot,
      ),
    };
    const decision = verifyF0WStudyExecutionApprovalCandidate(approvalCandidateInput(mutated));
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'APPROVAL_DUPLICATE_CANDIDATE_HASH',
    });
  });

  it('duplicate output root across two slots: APPROVAL_DUPLICATE_OUTPUT_ROOT', () => {
    const approval = validStudyApproval();
    const mutated = {
      ...approval,
      slots: approval.slots.map((slot, i) =>
        i === 1 ? { ...slot, outputRoot: approval.slots[0]!.outputRoot } : slot,
      ),
    };
    const decision = verifyF0WStudyExecutionApprovalCandidate(approvalCandidateInput(mutated));
    // The output-root mismatch (this slot's root no longer equals its OWN
    // frozen root) is detected before the duplicate-hash-shaped duplicate
    // check, and that is itself a refusal.
    expect(decision.granted).toBe(false);
  });

  it('mutated statement: APPROVAL_STATEMENT_MISMATCH', () => {
    const approval = validStudyApproval();
    const mutated = {
      ...approval,
      operatorApprovalStatement: `${approval.operatorApprovalStatement} `,
    };
    const decision = verifyF0WStudyExecutionApprovalCandidate(approvalCandidateInput(mutated));
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_STATEMENT_MISMATCH' });
  });

  it('expired approval', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate(
      approvalCandidateInput(validStudyApproval(), {
        nowUtc: () => new Date('2026-09-16T00:00:00Z'),
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_EXPIRED' });
  });

  it('not-yet-valid approval', () => {
    const decision = verifyF0WStudyExecutionApprovalCandidate(
      approvalCandidateInput(validStudyApproval(), {
        nowUtc: () => new Date('2026-09-14T00:00:00Z'),
      }),
    );
    expect(decision).toMatchObject({ granted: false, refusal: 'APPROVAL_NOT_YET_VALID' });
  });

  it('study execution-approval not listing this candidate: approvalListsCandidate is false', () => {
    const approval = validStudyApproval();
    expect(approvalListsCandidate(approval, 'PAIR_1_V4', sha256Hex('candidate-0'))).toBe(true);
    expect(approvalListsCandidate(approval, 'PAIR_1_V4', sha256Hex('some-other-bytes'))).toBe(
      false,
    );
    expect(approvalListsCandidate(approval, 'PAIR_9_UNKNOWN', sha256Hex('candidate-0'))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. The fail-closed sequencing gate.
// ---------------------------------------------------------------------------

function evidenceProbes(byRoot: Record<string, readonly string[] | undefined>): SlotEvidenceProbes {
  return {
    isDirectory: (path) => byRoot[path] !== undefined,
    listFilesRecursively: (path) => byRoot[path] ?? [],
  };
}

const SEQUENCING_ROOT_OF = (slot: (typeof F0V_SLOTS)[number]): string =>
  `/synthetic-study/${slot.futureOutputRootName}`;

describe('2D2C-F0W: the fail-closed sequencing gate', () => {
  it('PAIR_1_V4 (sequence 1) is eligible with no prior slots and no evidence of its own', () => {
    const decision = evaluateSequencingGate('PAIR_1_V4', SEQUENCING_ROOT_OF, evidenceProbes({}));
    expect(decision).toMatchObject({ eligible: true, slot: PAIR_1_V4 });
  });

  it('UNKNOWN_SLOT_ID for an unrecognised target', () => {
    const decision = evaluateSequencingGate(
      'PAIR_9_UNKNOWN',
      SEQUENCING_ROOT_OF,
      evidenceProbes({}),
    );
    expect(decision).toMatchObject({ eligible: false, refusal: 'UNKNOWN_SLOT_ID' });
  });

  it('out-of-order execution: PAIR_1_V5 (sequence 2) is refused while PAIR_1_V4 has not been attempted', () => {
    const decision = evaluateSequencingGate('PAIR_1_V5', SEQUENCING_ROOT_OF, evidenceProbes({}));
    expect(decision).toMatchObject({ eligible: false, refusal: 'PRIOR_SLOT_NOT_YET_CLASS_C' });
  });

  it('Class A prior slot (no evidence at all, structurally indistinguishable from "not yet attempted") blocks progression', () => {
    const decision = evaluateSequencingGate(
      'PAIR_1_V5',
      SEQUENCING_ROOT_OF,
      evidenceProbes({ [SEQUENCING_ROOT_OF(PAIR_1_V4)]: [] }),
    );
    expect(decision).toMatchObject({ eligible: false, refusal: 'PRIOR_SLOT_NOT_YET_CLASS_C' });
    const classification = classifySlotEvidence(
      SEQUENCING_ROOT_OF(PAIR_1_V4),
      evidenceProbes({ [SEQUENCING_ROOT_OF(PAIR_1_V4)]: [] }),
    );
    expect(inclusionClassOf(classification)).toBe(
      'NO_EVIDENCE_OR_CLASS_A_FAILURE_BEFORE_CONSUMPTION',
    );
  });

  it('Class B prior slot (authorisation consumed, confirmed pre-inference refusal) PAUSES the study', () => {
    const priorFiles = [
      `authorisations/${'a'.repeat(64)}.json`,
      'experiments/attempt-3/experiment-manifest.json',
      'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/planned-input.json',
      'experiments/attempt-3/experiment-stop.json',
    ];
    const decision = evaluateSequencingGate(
      'PAIR_1_V5',
      SEQUENCING_ROOT_OF,
      evidenceProbes({ [SEQUENCING_ROOT_OF(PAIR_1_V4)]: priorFiles }),
    );
    expect(decision).toMatchObject({ eligible: false, refusal: 'PRIOR_SLOT_PAUSED_CLASS_B' });
  });

  it('an ambiguous prior slot BLOCKS progression, fail closed', () => {
    const decision = evaluateSequencingGate(
      'PAIR_1_V5',
      SEQUENCING_ROOT_OF,
      evidenceProbes({ [SEQUENCING_ROOT_OF(PAIR_1_V4)]: ['unexpected-file.json'] }),
    );
    expect(decision).toMatchObject({ eligible: false, refusal: 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE' });
  });

  it('Class C prior slot NOT YET durably closed blocks progression', () => {
    const decision = evaluateSequencingGate(
      'PAIR_1_V5',
      SEQUENCING_ROOT_OF,
      evidenceProbes({
        [SEQUENCING_ROOT_OF(PAIR_1_V4)]: [
          'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/child-manifest.json',
        ],
      }),
    );
    expect(decision).toMatchObject({
      eligible: false,
      refusal: 'PRIOR_SLOT_CLASS_C_NOT_YET_DURABLY_CLOSED',
    });
  });

  it('Class C prior slot, durably closed, permits progression to the next frozen slot', () => {
    const decision = evaluateSequencingGate(
      'PAIR_1_V5',
      SEQUENCING_ROOT_OF,
      evidenceProbes({
        [SEQUENCING_ROOT_OF(PAIR_1_V4)]: [
          'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/child-manifest.json',
          'experiments/attempt-3/experiment-completion.json',
        ],
      }),
    );
    expect(decision).toMatchObject({ eligible: true, slot: PAIR_1_V5 });
  });

  it('never skips a paused slot: PAIR_2_V5 (sequence 3) is refused even though PAIR_1_V4 (sequence 1) closed cleanly, because PAIR_1_V5 (sequence 2) is Class B', () => {
    const decision = evaluateSequencingGate(
      'PAIR_2_V5',
      SEQUENCING_ROOT_OF,
      evidenceProbes({
        [SEQUENCING_ROOT_OF(PAIR_1_V4)]: [
          'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/child-manifest.json',
          'experiments/attempt-3/experiment-completion.json',
        ],
        [SEQUENCING_ROOT_OF(PAIR_1_V5)]: [
          `authorisations/${'b'.repeat(64)}.json`,
          'experiments/attempt-4/experiment-stop.json',
        ],
      }),
    );
    expect(decision).toMatchObject({
      eligible: false,
      refusal: 'PRIOR_SLOT_PAUSED_CLASS_B',
      blockingSlot: PAIR_1_V5,
    });
  });

  it('non-empty target root (already attempted) refuses a fresh start at that exact slot', () => {
    const decision = evaluateSequencingGate(
      'PAIR_1_V4',
      SEQUENCING_ROOT_OF,
      evidenceProbes({
        [SEQUENCING_ROOT_OF(PAIR_1_V4)]: [
          'evaluations/PROMPT_V4_CANONICAL/batch-01/attempt-3/child-manifest.json',
        ],
      }),
    );
    expect(decision).toMatchObject({
      eligible: false,
      refusal: 'TARGET_SLOT_ALREADY_HAS_EVIDENCE',
    });
  });

  it('an unreadable prior root is AMBIGUOUS, never read as "nothing happened"', () => {
    const probes: SlotEvidenceProbes = {
      isDirectory: () => true,
      listFilesRecursively: () => {
        throw new Error('EACCES');
      },
    };
    const decision = evaluateSequencingGate('PAIR_1_V5', SEQUENCING_ROOT_OF, probes);
    expect(decision).toMatchObject({ eligible: false, refusal: 'PRIOR_SLOT_AMBIGUOUS_EVIDENCE' });
  });
});

// ---------------------------------------------------------------------------
// 6. Output-root readiness (inspect only) and the real frozen paths.
// ---------------------------------------------------------------------------

describe('2D2C-F0W: output-root readiness', () => {
  it('the REAL frozen study root and all ten REAL frozen slot roots are currently absent', () => {
    expect(existsSync(F0V_STUDY_ROOT)).toBe(false);
    for (const slot of F0V_SLOTS) {
      expect(existsSync(futureOutputRootPathOf(F0V_STUDY_ROOT, slot))).toBe(false);
    }
  });

  it('inspectStudyRootReadiness reports allAbsent against a synthetic exists-probe with nothing present', () => {
    const readiness = inspectStudyRootReadiness(
      { exists: () => false },
      '/synthetic-study',
      F0V_SLOTS,
    );
    expect(readiness.allAbsent).toBe(true);
    expect(readiness.slotRoots).toHaveLength(F0V_TOTAL_SLOTS);
  });

  it('inspectStudyRootReadiness reports NOT allAbsent when even one slot root exists', () => {
    const target = futureOutputRootPathOf('/synthetic-study', PAIR_1_V4);
    const readiness = inspectStudyRootReadiness(
      { exists: (path) => path === target },
      '/synthetic-study',
      F0V_SLOTS,
    );
    expect(readiness.allAbsent).toBe(false);
    expect(readiness.slotRoots.find((entry) => entry.root === target)?.absent).toBe(false);
  });

  it('the ten frozen slot output roots are pairwise unique', () => {
    expect(slotOutputRootsAreUnique()).toBe(true);
  });

  it('symlink target/root component is refused (delegates to validateOutputRoot, no second implementation)', () => {
    const decision = validateSlotOutputRootForExecution('/synthetic-study/pair-1-v4', [], {
      realpath: () => '/elsewhere/real-path',
      isDirectory: () => true,
    });
    expect(decision).toEqual(
      validateOutputRoot('/synthetic-study/pair-1-v4', [], {
        realpath: () => '/elsewhere/real-path',
        isDirectory: () => true,
      }),
    );
    expect(decision.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. The coordinator builds and launches all twelve children, for BOTH
//    a V4 slot and a V5 slot, over a fake launcher.
// ---------------------------------------------------------------------------

function tier2Ok(scratch: string) {
  return {
    outcome: 'COMPLETED' as const,
    platform: 'posix' as const,
    pid: 4343,
    exitCode: 0,
    signal: null,
    gracefulShutdownRequested: false,
    gracefulPhase: null,
    gracePhaseVerdict: null,
    shutdownAcknowledged: false,
    exitedWithinGrace: false,
    gracefulShutdownConfirmed: false,
    hardKillRequired: false,
    hardKillDisposition: 'NOT_REQUIRED' as const,
    hardKillSuppressionReason: null,
    hardKill: null,
    posixGroupSweep: 'NO_SUCH_PROCESS' as const,
    stderrTail: '',
    scratchDir: join(scratch, 'gone'),
  };
}

function fakeLauncher(requestedModelId: string): {
  readonly launcher: ChildLauncher;
  readonly launched: { variantName: string; ordinal: number; attemptNo: number }[];
} {
  const launched: { variantName: string; ordinal: number; attemptNo: number }[] = [];
  const launcher: ChildLauncher = {
    launch: async (input: ChildLaunchInput) => {
      const manifest = (
        JSON.parse(readFileSync(input.manifestPath, 'utf8')) as {
          record: { variantName: string; logicalBatchOrdinal: number; attemptNo: number };
        }
      ).record;
      launched.push({
        variantName: manifest.variantName,
        ordinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
      });
      const dir = input.attemptDir;
      writeArtifactOnce(dir, 'CHILD_PREFLIGHT', {
        ok: true,
        stopCondition: null,
        detail: 'fake',
        checks: [],
        providerConstructed: false,
      });
      const serialization = canonicalStringify({ results: [] });
      writeArtifactOnce(dir, 'RAW_OUTPUT_CHECKPOINT', {
        rawOutputCanonicalSerialization: serialization,
        rawOutputSha256: sha256Hex(serialization),
        rawOutputUtf8Bytes: Buffer.byteLength(serialization, 'utf8'),
      });
      writeArtifactOnce(dir, 'VALIDATION_RESULT', {
        kind: 'SCHEMA_INVALID',
        detail: 'fake',
        accepted: [],
        rejected: [],
      });
      writeArtifactOnce(dir, 'PROVIDER_OUTCOME', {
        outcome: 'OK',
        providerReportedModelId: requestedModelId,
        inputTokens: 10,
        outputTokens: 20,
        outcomeDetail: null,
        internalAdapterAttemptCountWhereObservable: 1,
        authStatusInvocationsObserved: 1,
        startedAtUtc: '2026-09-15T12:00:00.000Z',
        endedAtUtc: '2026-09-15T12:00:01.000Z',
        monotonicWallTimeMs: 1000,
        tier1DiagnosticsCaptured: 0,
      });
      writeArtifactOnce(dir, 'CHILD_RESULT', {
        variantName: manifest.variantName,
        logicalBatchOrdinal: manifest.logicalBatchOrdinal,
        attemptNo: manifest.attemptNo,
        providerOutcome: 'OK',
        providerReportedModelId: requestedModelId,
        rawCheckpointPersistedBeforeValidation: true,
        rawBeforeValidationSequence: { persistedSeq: 1, validationStartedSeq: 2 },
        childStopCondition: null,
        artifactHashes: {},
        repairRound: null,
      });
      return tier2Ok(SCRATCH);
    },
  };
  return { launcher, launched };
}

function experimentInputForSlot(
  slot: (typeof F0V_SLOTS)[number],
  overrides: Partial<ExperimentInput> & { readonly launcher: ChildLauncher },
): ExperimentInput {
  const template = buildSlotExecutionPlanTemplate(slot, F0I_PLAN, F0O_PLAN);
  const outputRoot = scratchDir('out');
  return {
    plan: template.plan,
    freezePath: join(ROOT, template.freezePath),
    outputRoot,
    attemptNo: template.attemptNo,
    authorisation: { authorisationVersion: 'synthetic-for-test', slotId: slot.slotId },
    authorisationSha256: sha256Hex(`f0w-auth-${slot.slotId}-${counter}`),
    variantRoots: { [slot.variantName]: `/synthetic/variant-root-${slot.variantName}` },
    classifierConfigDir: '/synthetic/profile',
    parentEnv: { PATH: '/usr/bin', HOME: '/home/x' },
    platform: 'posix',
    clock: { nowUtc: () => new Date('2026-09-15T12:00:00Z') },
    ...overrides,
  };
}

describe('2D2C-F0W: the coordinator builds and launches all twelve children for a slot of EACH variant', () => {
  it('PAIR_1_V4 (reusing attempt 3 / F0I, unchanged) runs to completion against a fake launcher', async () => {
    const { launcher, launched } = fakeLauncher(F0I_PLAN.requestedModelId);
    const input = experimentInputForSlot(PAIR_1_V4, { launcher });
    const result = await runExperiment(input);
    expect(result.status).toBe('COMPLETED_ALL_PLANNED');
    expect(result.evaluationsStarted).toBe(12);
    expect(launched).toEqual(
      Array.from({ length: 12 }, (_, index) => ({
        variantName: 'PROMPT_V4_CANONICAL',
        ordinal: index + 1,
        attemptNo: 3,
      })),
    );
    expect(existsSync(authorisationMarkerPathOf(input.outputRoot, input.authorisationSha256))).toBe(
      true,
    );
  });

  it('PAIR_1_V5 (reusing attempt 4 / F0O, unchanged) runs to completion against a fake launcher', async () => {
    const { launcher, launched } = fakeLauncher(F0O_PLAN.requestedModelId);
    const input = experimentInputForSlot(PAIR_1_V5, { launcher });
    const result = await runExperiment(input);
    expect(result.status).toBe('COMPLETED_ALL_PLANNED');
    expect(result.evaluationsStarted).toBe(12);
    expect(launched).toEqual(
      Array.from({ length: 12 }, (_, index) => ({
        variantName: 'PROMPT_V5_CANONICAL',
        ordinal: index + 1,
        attemptNo: 4,
      })),
    );
  });
});

// ---------------------------------------------------------------------------
// 8. PROCESS level: the REAL Tier-2 child entry, for BOTH V4 and V5 slots.
//    This is the physical, request-free proof that BOTH replication
//    variants reach the point immediately before provider inference.
// ---------------------------------------------------------------------------

describe.skipIf(IS_WINDOWS)(
  '2D2C-F0W: the REAL child entry under a slot-derived manifest, for BOTH V4 and V5',
  () => {
    it.each([
      { slot: PAIR_1_V4, label: 'V4 (attempt 3 / F0I reused)' },
      { slot: PAIR_1_V5, label: 'V5 (attempt 4 / F0O reused)' },
    ])(
      'boots, admits the $label manifest, resolves the correct historical family by hash, and stops at preflight against a non-frozen root — before any provider import',
      async ({ slot }) => {
        const pids: number[] = [];
        const launcher: ChildLauncher = {
          launch: (input) =>
            runProcessIsolatedBatch({
              modulePath: CHILD_ENTRY_PATH,
              args: ['--manifest', input.manifestPath],
              watchdogMs: 20_000,
              graceMs: 1_000,
              childEnv: input.childEnv,
              onChildSpawned: (pid) => {
                pids.push(pid);
              },
            }),
        };
        const template = buildSlotExecutionPlanTemplate(slot, F0I_PLAN, F0O_PLAN);
        const input = experimentInputForSlot(slot, {
          launcher,
          plan: {
            ...template.plan,
            evaluations: template.plan.evaluations.slice(0, 1),
            plannedLogicalEvaluations: 1,
          },
          // THIS worktree, which is NOT the frozen variant runtime root: the
          // root check fails, which is what makes the run structurally
          // unable to reach a provider, an auth path or a socket.
          variantRoots: { [slot.variantName]: ROOT },
          parentEnv: {
            PATH: process.env['PATH'] ?? '',
            HOME: process.env['HOME'] ?? '',
            TMPDIR: process.env['TMPDIR'] ?? tmpdir(),
          },
        });
        const result = await runExperiment(input);
        expect(result.halt).toMatchObject({
          kind: 'STOP_CONDITION',
          stopCondition: 'CORPUS_CONFIG_OR_HASH_DRIFT',
          atSequence: 1,
        });
        expect(pids).toHaveLength(1);
        const dir = attemptDirectoryOf(input.outputRoot, slot.variantName, 1, template.attemptNo);
        const preflight = record<{
          ok: boolean;
          providerConstructed: boolean;
          checks: { stage: string };
        }>(dir, 'CHILD_PREFLIGHT');
        expect(preflight?.ok).toBe(false);
        expect(preflight?.providerConstructed).toBe(false);
        expect(preflight?.checks.stage).toBe('variantRoot');
        expect(existsSync(join(dir, 'provider-outcome.json'))).toBe(false);
        expect(existsSync(join(dir, 'raw-output-checkpoint.json'))).toBe(false);
      },
      60_000,
    );
  },
);

// ---------------------------------------------------------------------------
// 9. The readiness CLI, against REAL committed F0V/F0I/F0O bytes.
// ---------------------------------------------------------------------------

describe('2D2C-F0W: parseF0WCliArgs is a closed parser', () => {
  it('parses every flag, and refuses an unknown one', () => {
    const options = parseF0WCliArgs([
      '--json',
      '--verify-authorisation-candidate',
      '/a.json',
      '--slot',
      'PAIR_1_V4',
    ]);
    expect(options).toEqual({
      json: true,
      verifySlotCandidatePath: '/a.json',
      verifySlotId: 'PAIR_1_V4',
      verifyStudyApprovalCandidatePath: null,
    });
    expect(() => parseF0WCliArgs(['--bogus'])).toThrow(/unknown argument/);
  });
});

describe('2D2C-F0W: the readiness report against real committed bytes', () => {
  it('reports READY (no problems) with no root created', () => {
    const report = buildReadinessReport(RUNNER_REPO_ROOT);
    expect(report.f0vFreezeVerified).toBe(true);
    expect(report.f0iFreezeVerified).toBe(true);
    expect(report.f0oFreezeVerified).toBe(true);
    expect(report.totalSlots).toBe(F0V_TOTAL_SLOTS);
    expect(report.outputRootReadiness?.allAbsent).toBe(true);
    expect(report.problems).toEqual([]);
    expect(existsSync(F0V_STUDY_ROOT)).toBe(false);
  });

  it('CLI stdout reports the READY outcome as JSON', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const { runF0WCli } = await import('../harness/phase2b2d2c/f0w/cliF0W.js');
    const exitCode = await runF0WCli(['--json'], {
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
      env: {},
      nowUtc: () => NOW,
    });
    expect(exitCode).toBe(0);
    const summary = JSON.parse(out.join('')) as { outcome: string };
    expect(summary.outcome).toBe(
      'REPLICATION_STUDY_MECHANICALLY_READY_FOR_CANDIDATE_MATERIALISATION',
    );
    expect(err).toEqual([]);
  });
});

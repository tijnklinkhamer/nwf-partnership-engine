/**
 * PHASE 2B-2D2C-F3 — THE FINAL-V6 EXECUTION-CONTROL AUTHORITY.
 *
 * Request-free throughout: no provider, no inference, no auth-status
 * invocation, no child process, no network, no database, no real output root
 * and no real study-level approval. Every "valid" case is assembled from
 * SYNTHETIC bytes in memory; the only file this suite reads from disk is the
 * committed, owner-approved F2 freeze, which the registry loader re-hashes.
 *
 * The suite's job is to prove the negatives: that a candidate for one slot,
 * one build, one freeze, one plan, one prompt, one reliability semantics or
 * one output root can never be replayed as another — and that five valid
 * candidates with NO study-level approval authorise exactly nothing.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ATTEMPT4_AUTHORISATION_VERSION,
  ATTEMPT_1_AUTHORISATION_VERSION,
  ATTEMPT_2_AUTHORISATION_VERSION,
  ATTEMPT_3_AUTHORISATION_VERSION,
} from '../harness/phase2b2d2c/f0o/authorisationF0O.js';
import { F0W_SLOT_AUTHORISATION_VERSION } from '../harness/phase2b2d2c/f0w/authorisationF0W.js';
import { F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION } from '../harness/phase2b2d2c/f0x/recovery1Authority.js';
import { RELIABILITY_SEMANTICS_V1_HISTORICAL } from '../harness/phase2b2d2c/constants.js';
import {
  F2_APPROVAL_RECORD_PATH,
  F2_FREEZE_PATH,
  F2_STUDY_ROOT,
} from '../harness/phase2b2d2c/f2/freezeF2.js';
import {
  F2_N_REPLICATES,
  f2OutputRootPathOf,
  type F2SlotIdentity,
} from '../harness/phase2b2d2c/f2/studyPlanCoreF2.js';
import {
  evaluateF3SlotExecutionLock,
  F3_SLOT_AUTHORISATION_VERSION,
  F3_STUDY_ID,
  type F3SlotExecutionAuthorisation,
} from '../harness/phase2b2d2c/f3/authorisationF3.js';
import { evaluateF3ComposedSlotExecutionDecision } from '../harness/phase2b2d2c/f3/composedExecutionDecisionF3.js';
import { runF3AllFivePreflight } from '../harness/phase2b2d2c/f3/allFivePreflightF3.js';
import { runF3SlotExecution } from '../harness/phase2b2d2c/f3/executionGuardF3.js';
import { loadF3SlotRegistry } from '../harness/phase2b2d2c/f3/slotRegistryF3.js';
import {
  buildF3StudyExecutionApprovalStatement,
  F3_STUDY_EXECUTION_APPROVAL_VERSION,
  type F3StudyApprovalSlotEntry,
  type F3StudyExecutionApproval,
} from '../harness/phase2b2d2c/f3/studyExecutionApprovalF3.js';
import {
  buildF3SlotCandidate,
  f3FileBytes,
} from '../harness/phase2b2d2c/f3/materialiseF3Candidates.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const FREEZE_PATH = join(REPO_ROOT, F2_FREEZE_PATH);
const OWNER_APPROVAL_PATH = join(REPO_ROOT, F2_APPROVAL_RECORD_PATH);

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const registry = loadF3SlotRegistry(readFileSync(FREEZE_PATH));

/** A synthetic, already-"committed" execution build. Never a real commit. */
const BUILD = '1234567890abcdef1234567890abcdef12345678';
const OTHER_BUILD = 'fedcba0987654321fedcba0987654321fedcba09';

const ISSUED = '2026-09-17T00:00:00.000Z';
const VALID_UNTIL = '2026-09-17T12:00:00.000Z';
const NOW = new Date('2026-09-17T06:00:00.000Z');

const MODEL = registry.requestedModelId;

const slotOf = (slotId: string): F2SlotIdentity => registry.resolveSlot(slotId);
const rootOf = (slot: F2SlotIdentity): string => f2OutputRootPathOf(F2_STUDY_ROOT, slot);

const candidateFor = (slotId: string): F3SlotExecutionAuthorisation =>
  buildF3SlotCandidate(slotOf(slotId), BUILD, MODEL, ISSUED, VALID_UNTIL);

/** An in-memory filesystem: the only "files" these tests ever present. */
function fsOf(entries: Readonly<Record<string, Buffer>>): (path: string) => Buffer {
  return (path: string): Buffer => {
    const bytes = entries[path];
    if (bytes === undefined) throw new Error(`ENOENT: ${path}`);
    return bytes;
  };
}

const CANDIDATE_PATH = (slotId: string): string => `/synthetic/execution-candidates/${slotId}.json`;
const APPROVAL_PATH = '/synthetic/STUDY_EXECUTION_APPROVAL.json';

interface LockCase {
  readonly slotId?: string;
  readonly expectSlotId?: string;
  readonly mutate?: (candidate: F3SlotExecutionAuthorisation) => unknown;
  readonly now?: Date;
  readonly head?: string;
  readonly consumed?: boolean;
  readonly model?: string;
  readonly rawBytes?: Buffer;
}

/** Evaluates the per-slot lock over one synthetic candidate. */
function lock(testCase: LockCase = {}): ReturnType<typeof evaluateF3SlotExecutionLock> {
  const slotId = testCase.slotId ?? 'V6_REP_1';
  const expectSlotId = testCase.expectSlotId ?? slotId;
  const base = candidateFor(slotId);
  const document = testCase.mutate === undefined ? base : testCase.mutate(base);
  const bytes = testCase.rawBytes ?? f3FileBytes(document);
  const path = CANDIDATE_PATH(slotId);
  return evaluateF3SlotExecutionLock({
    executeFlag: true,
    authorisationPath: path,
    expected: { slotId: expectSlotId, outputRoot: rootOf(slotOf(expectSlotId)) },
    readFile: fsOf({ [path]: bytes }),
    sha256,
    alreadyConsumed: () => testCase.consumed ?? false,
    nowUtc: () => testCase.now ?? NOW,
    currentHead: () => testCase.head ?? BUILD,
    expectedRequestedModelId: testCase.model ?? MODEL,
    resolveSlot: (id) => registry.resolveSlot(id),
  });
}

/** Every field of a candidate, with one key replaced. */
function withField(
  candidate: F3SlotExecutionAuthorisation,
  key: string,
  value: unknown,
): Record<string, unknown> {
  return { ...(candidate as unknown as Record<string, unknown>), [key]: value };
}

// ---------------------------------------------------------------------------

describe('2D2C-F3: the frozen five-slot registry', () => {
  it('holds exactly five slots, V6_REP_1..5, in frozen order, with distinct output roots', () => {
    expect(registry.totalSlots).toBe(5);
    expect(F2_N_REPLICATES).toBe(5);
    expect(registry.slots.map((slot) => slot.slotId)).toEqual([
      'V6_REP_1',
      'V6_REP_2',
      'V6_REP_3',
      'V6_REP_4',
      'V6_REP_5',
    ]);
    expect(registry.slots.map((slot) => slot.sequence)).toEqual([1, 2, 3, 4, 5]);
    const roots = registry.slots.map((slot) => rootOf(slot));
    expect(new Set(roots).size).toBe(5);
  });

  it('refuses an unknown slot id rather than guessing the closest one', () => {
    expect(() => registry.resolveSlot('V6_REP_6')).toThrow(/not one of the 5 frozen/);
    expect(() => registry.resolveSlot('PAIR_1_V4')).toThrow(/not one of the 5 frozen/);
  });
});

describe('2D2C-F3: the per-slot lock accepts exactly one intact candidate', () => {
  it('grants a valid, current, unconsumed candidate for its own slot', () => {
    const decision = lock();
    expect(decision.granted).toBe(true);
    if (!decision.granted) return;
    expect(decision.slot.slotId).toBe('V6_REP_1');
    expect(decision.authorisation.studyId).toBe(F3_STUDY_ID);
    expect(decision.authorisationBytes).toBeGreaterThan(0);
  });

  it('a candidate for V6_REP_1 cannot validate as V6_REP_2', () => {
    const decision = lock({ slotId: 'V6_REP_1', expectSlotId: 'V6_REP_2' });
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_SLOT_MISMATCH' });
  });

  it('every one of the five candidates validates only for its own slot', () => {
    for (const slot of registry.slots) {
      expect(lock({ slotId: slot.slotId }).granted).toBe(true);
      for (const other of registry.slots) {
        if (other.slotId === slot.slotId) continue;
        expect(
          lock({ slotId: slot.slotId, expectSlotId: other.slotId }),
          `${slot.slotId} as ${other.slotId}`,
        ).toMatchObject({ granted: false, refusal: 'AUTHORISATION_SLOT_MISMATCH' });
      }
    }
  });

  it('refuses a sequence that disagrees with the frozen registry', () => {
    const decision = lock({ mutate: (c) => withField(c, 'sequence', 2) });
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it('refuses a replicate number that disagrees with the frozen registry', () => {
    const decision = lock({ mutate: (c) => withField(c, 'replicateNumber', 3) });
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_SLOT_FIELD_MISMATCH',
    });
  });

  it("refuses an output root that is not this slot's frozen root", () => {
    const decision = lock({
      mutate: (c) => withField(c, 'outputRoot', rootOf(slotOf('V6_REP_5'))),
    });
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_OUTPUT_ROOT_MISMATCH',
    });
  });

  it('refuses a drifted F2 freeze hash, byte length, plan hash, or owner-approval identity', () => {
    const drifted: readonly [string, unknown][] = [
      ['f2FreezeRawSha256', 'a'.repeat(64)],
      ['f2FreezeRawBytes', 26_447],
      ['f2PlanSha256', 'b'.repeat(64)],
      ['f2OwnerFreezeApprovalRawSha256', 'c'.repeat(64)],
      ['f2OwnerFreezeApprovalRawBytes', 27_289],
    ];
    for (const [key, value] of drifted) {
      expect(lock({ mutate: (c) => withField(c, key, value) }), key).toMatchObject({
        granted: false,
        refusal: 'AUTHORISATION_MALFORMED',
      });
    }
  });

  it('refuses a drifted runtime, semantic-source, reliability-base or prompt identity', () => {
    const drifted: readonly [string, unknown][] = [
      ['integratedRuntimeCommit', OTHER_BUILD],
      ['semanticSourceCommit', OTHER_BUILD],
      ['reliabilityBaseCommit', OTHER_BUILD],
      ['promptVersion', 'orgunit-classifier-prompt-v5'],
      ['promptSha256', 'd'.repeat(64)],
    ];
    for (const [key, value] of drifted) {
      expect(lock({ mutate: (c) => withField(c, key, value) }), key).toMatchObject({
        granted: false,
        refusal: 'AUTHORISATION_MALFORMED',
      });
    }
  });

  it('refuses reliability semantics v1, and refuses an unknown reliability version', () => {
    expect(
      lock({
        mutate: (c) =>
          withField(c, 'reliabilitySemanticsVersion', RELIABILITY_SEMANTICS_V1_HISTORICAL),
      }),
    ).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
    expect(
      lock({
        mutate: (c) =>
          withField(c, 'reliabilitySemanticsVersion', 'RELIABILITY_SEMANTICS_V3_SOMETHING_NEW'),
      }),
    ).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('refuses a C2 status or C2 flag that claims C2 is implemented', () => {
    expect(lock({ mutate: (c) => withField(c, 'c2Status', 'IMPLEMENTED') })).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_MALFORMED',
    });
    expect(lock({ mutate: (c) => withField(c, 'c2Implemented', true) })).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_MALFORMED',
    });
  });

  it('refuses a drifted request ceiling, adapter ceiling, document count or timeout ceiling', () => {
    const drifted: readonly [string, unknown][] = [
      ['maxProviderRequests', 62],
      ['maxAdapterAttempts', 184],
      ['documentCount', 48],
      ['maxLogicalEvaluations', 13],
      ['maxNonTerminalTimeoutsPerReplicate', 3],
      ['frozenLogicalBatchOrdinals', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 11]],
    ];
    for (const [key, value] of drifted) {
      expect(lock({ mutate: (c) => withField(c, key, value) }), key).toMatchObject({
        granted: false,
        refusal: 'AUTHORISATION_MALFORMED',
      });
    }
  });

  it('refuses a drifted repair policy, run config or SDK pin', () => {
    const drifted: readonly [string, unknown][] = [
      [
        'repairPolicy',
        { enabled: false, maxRoundsPerLogicalEvaluation: 1, minimumRemainingBudgetMs: 120_000 },
      ],
      [
        'repairPolicy',
        { enabled: true, maxRoundsPerLogicalEvaluation: 2, minimumRemainingBudgetMs: 120_000 },
      ],
      [
        'repairPolicy',
        { enabled: true, maxRoundsPerLogicalEvaluation: 1, minimumRemainingBudgetMs: 60_000 },
      ],
      ['runConfig', { maxTurns: 4, thinking: 'disabled' }],
      ['runConfig', { maxTurns: 3, thinking: 'enabled' }],
      ['agentSdkVersion', '0.3.250'],
    ];
    for (const [key, value] of drifted) {
      expect(
        lock({ mutate: (c) => withField(c, key, value) }),
        JSON.stringify(value),
      ).toMatchObject({
        granted: false,
        refusal: 'AUTHORISATION_MALFORMED',
      });
    }
  });

  it("refuses a requested model id that is not the approved freeze's own", () => {
    const decision = lock({ model: 'some-other-model-id' });
    expect(decision).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MODEL_MISMATCH' });
  });

  it('refuses an edited operator statement', () => {
    const decision = lock({
      mutate: (c) => withField(c, 'operatorAuthorisationStatement', 'I AUTHORISE EVERYTHING.'),
    });
    expect(decision).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_STATEMENT_MISMATCH',
    });
  });

  it('refuses an expired candidate and a not-yet-valid one', () => {
    expect(lock({ now: new Date('2026-09-18T00:00:00.000Z') })).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_EXPIRED',
    });
    expect(lock({ now: new Date('2026-09-16T00:00:00.000Z') })).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_NOT_YET_VALID',
    });
  });

  it('refuses an already-consumed candidate', () => {
    expect(lock({ consumed: true })).toMatchObject({
      granted: false,
      refusal: 'AUTHORISATION_ALREADY_CONSUMED',
    });
  });

  it('refuses when the checked-out HEAD is not the build the candidate binds', () => {
    expect(lock({ head: OTHER_BUILD })).toMatchObject({
      granted: false,
      refusal: 'EXECUTION_BUILD_MISMATCH',
    });
  });

  it('refuses every superseded authorisation version by name', () => {
    const superseded = [
      ATTEMPT_1_AUTHORISATION_VERSION,
      ATTEMPT_2_AUTHORISATION_VERSION,
      ATTEMPT_3_AUTHORISATION_VERSION,
      ATTEMPT4_AUTHORISATION_VERSION,
      F0W_SLOT_AUTHORISATION_VERSION,
      F0X_RECOVERY_1_SLOT_AUTHORISATION_VERSION,
    ];
    for (const version of superseded) {
      const decision = lock({
        rawBytes: f3FileBytes({ authorisationVersion: version, slotId: 'V6_REP_1' }),
      });
      expect(decision, version).toMatchObject({
        granted: false,
        refusal: 'SUPERSEDED_AUTHORISATION_PRESENTED',
      });
    }
  });

  it('refuses a real V4/V5 replication candidate shape outright', () => {
    const v4Candidate = {
      authorisationVersion: F0W_SLOT_AUTHORISATION_VERSION,
      scope: 'DEVELOPMENT_ONLY',
      studyId: 'REPLICATION_V4_V5_N5',
      slotId: 'PAIR_1_V4',
      sequence: 1,
      pairNumber: 1,
      variantName: 'PROMPT_V4_CANONICAL',
      historicalAttemptNo: 3,
    };
    expect(lock({ rawBytes: f3FileBytes(v4Candidate) })).toMatchObject({
      granted: false,
      refusal: 'SUPERSEDED_AUTHORISATION_PRESENTED',
    });
    // And a V4 variant smuggled under the F3 version literal is malformed:
    // `variantName` is pinned to PROMPT_V6_CANONICAL.
    expect(
      lock({ mutate: (c) => withField(c, 'variantName', 'PROMPT_V4_CANONICAL') }),
    ).toMatchObject({ granted: false, refusal: 'AUTHORISATION_MALFORMED' });
  });

  it('refuses an absent path, a relative path and an unreadable file', () => {
    const common = {
      executeFlag: true as const,
      expected: { slotId: 'V6_REP_1', outputRoot: rootOf(slotOf('V6_REP_1')) },
      readFile: fsOf({}),
      sha256,
      alreadyConsumed: () => false,
      nowUtc: () => NOW,
      currentHead: () => BUILD,
      expectedRequestedModelId: MODEL,
      resolveSlot: (id: string) => registry.resolveSlot(id),
    };
    expect(evaluateF3SlotExecutionLock({ ...common, authorisationPath: null })).toMatchObject({
      refusal: 'AUTHORISATION_PATH_ABSENT',
    });
    expect(
      evaluateF3SlotExecutionLock({ ...common, authorisationPath: 'relative/path.json' }),
    ).toMatchObject({ refusal: 'AUTHORISATION_PATH_NOT_ABSOLUTE' });
    expect(
      evaluateF3SlotExecutionLock({ ...common, authorisationPath: '/synthetic/missing.json' }),
    ).toMatchObject({ refusal: 'AUTHORISATION_UNREADABLE' });
  });

  it('refuses without the explicit execute flag', () => {
    const path = CANDIDATE_PATH('V6_REP_1');
    expect(
      evaluateF3SlotExecutionLock({
        executeFlag: false,
        authorisationPath: path,
        expected: { slotId: 'V6_REP_1', outputRoot: rootOf(slotOf('V6_REP_1')) },
        readFile: fsOf({ [path]: f3FileBytes(candidateFor('V6_REP_1')) }),
        sha256,
        alreadyConsumed: () => false,
        nowUtc: () => NOW,
        currentHead: () => BUILD,
        expectedRequestedModelId: MODEL,
        resolveSlot: (id) => registry.resolveSlot(id),
      }),
    ).toMatchObject({ granted: false, refusal: 'EXECUTE_FLAG_ABSENT' });
  });
});

// ---------------------------------------------------------------------------
// The study-level approval. Synthetic bytes ONLY — no real approval exists.
// ---------------------------------------------------------------------------

function approvalEntriesFor(
  slots: readonly F2SlotIdentity[],
  overrides: Partial<F3StudyApprovalSlotEntry>[] = [],
): F3StudyApprovalSlotEntry[] {
  return slots.map((slot, index) => {
    const bytes = f3FileBytes(candidateFor(slot.slotId));
    return {
      slotId: slot.slotId,
      sequence: slot.sequence,
      variantName: 'PROMPT_V6_CANONICAL' as const,
      candidateAuthorisationSha256: sha256(bytes),
      candidateAuthorisationBytes: bytes.length,
      outputRoot: rootOf(slot),
      ...(overrides[index] ?? {}),
    };
  });
}

function approvalFor(
  entries: readonly F3StudyApprovalSlotEntry[],
  build: string = BUILD,
): F3StudyExecutionApproval {
  const base = candidateFor('V6_REP_1');
  return {
    approvalVersion: F3_STUDY_EXECUTION_APPROVAL_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: F3_STUDY_ID,
    f2FreezeRawSha256: base.f2FreezeRawSha256,
    f2FreezeRawBytes: base.f2FreezeRawBytes,
    f2PlanSha256: base.f2PlanSha256,
    f2OwnerFreezeApprovalRawSha256: base.f2OwnerFreezeApprovalRawSha256,
    f2OwnerFreezeApprovalRawBytes: base.f2OwnerFreezeApprovalRawBytes,
    promptSha256: base.promptSha256,
    reliabilitySemanticsVersion: base.reliabilitySemanticsVersion,
    executionBuildCommit: build,
    slots: entries as F3StudyApprovalSlotEntry[],
    issuedAtUtc: ISSUED,
    validUntilUtc: VALID_UNTIL,
    operatorApprovalStatement: buildF3StudyExecutionApprovalStatement(build, entries),
  };
}

/** The composed six-gate decision over synthetic candidates and an optional approval. */
function composed(options: {
  readonly slotId?: string;
  readonly approval?: unknown;
  readonly approvalPath?: string | null;
  readonly head?: string;
  readonly outputRootExists?: boolean;
  readonly candidateOverride?: Record<string, Buffer>;
}): ReturnType<typeof evaluateF3ComposedSlotExecutionDecision> {
  const slotId = options.slotId ?? 'V6_REP_1';
  const files: Record<string, Buffer> = {};
  for (const slot of registry.slots) {
    files[CANDIDATE_PATH(slot.slotId)] = f3FileBytes(candidateFor(slot.slotId));
  }
  Object.assign(files, options.candidateOverride ?? {});
  if (options.approval !== undefined) files[APPROVAL_PATH] = f3FileBytes(options.approval);
  const rootExists = options.outputRootExists ?? true;
  return evaluateF3ComposedSlotExecutionDecision({
    targetSlotId: slotId,
    registry,
    authorisationPath: CANDIDATE_PATH(slotId),
    studyApprovalPath:
      options.approvalPath === undefined
        ? options.approval === undefined
          ? null
          : APPROVAL_PATH
        : options.approvalPath,
    readFile: fsOf(files),
    sha256,
    nowUtc: () => NOW,
    currentHead: () => options.head ?? BUILD,
    alreadyConsumed: () => false,
    // No slot has any evidence: "before slot 1", every root absent.
    sequencingProbes: {
      isDirectory: () => false,
      listFilesRecursively: () => [],
      readFile: fsOf(files),
    },
    outputRootProbes: {
      realpath: (path) => {
        if (!rootExists) throw new Error(`ENOENT: ${path}`);
        return path;
      },
      isDirectory: () => rootExists,
    },
    forbiddenOutputRootContainers: [REPO_ROOT],
  });
}

describe('2D2C-F3: the study-level approval schema (synthetic bytes only)', () => {
  it('a five-slot approval over the five real candidate hashes permits a grant', () => {
    const decision = composed({ approval: approvalFor(approvalEntriesFor(registry.slots)) });
    expect(decision.granted).toBe(true);
    if (!decision.granted) return;
    expect(decision.slot.slotId).toBe('V6_REP_1');
    expect(decision.executionBuildCommit).toBe(BUILD);
  });

  it('refuses an approval listing only four slots', () => {
    const decision = composed({
      approval: approvalFor(approvalEntriesFor(registry.slots.slice(0, 4))),
    });
    expect(decision).toMatchObject({ failedGate: 'STUDY_APPROVAL', refusal: 'APPROVAL_MALFORMED' });
  });

  it('refuses an approval listing six slots', () => {
    const entries = approvalEntriesFor(registry.slots);
    const sixth = { ...entries[0]!, slotId: 'V6_REP_6', sequence: 5 };
    const decision = composed({ approval: approvalFor([...entries, sixth]) });
    expect(decision).toMatchObject({ failedGate: 'STUDY_APPROVAL', refusal: 'APPROVAL_MALFORMED' });
  });

  it('refuses a reordered five-slot approval', () => {
    const entries = approvalEntriesFor(registry.slots);
    const reordered = [entries[1]!, entries[0]!, entries[2]!, entries[3]!, entries[4]!];
    const decision = composed({ approval: approvalFor(reordered) });
    expect(decision).toMatchObject({
      failedGate: 'STUDY_APPROVAL',
      refusal: 'APPROVAL_SLOT_ORDER_MISMATCH',
    });
  });

  it('refuses an approval naming the same candidate hash for two slots', () => {
    const entries = approvalEntriesFor(registry.slots);
    const duplicated = entries.map((entry, index) =>
      index === 1
        ? {
            ...entry,
            candidateAuthorisationSha256: entries[0]!.candidateAuthorisationSha256,
            candidateAuthorisationBytes: entries[0]!.candidateAuthorisationBytes,
          }
        : entry,
    );
    const decision = composed({ approval: approvalFor(duplicated) });
    expect(decision).toMatchObject({
      failedGate: 'STUDY_APPROVAL',
      refusal: 'APPROVAL_DUPLICATE_CANDIDATE_HASH',
    });
  });

  it('refuses an approval naming the same output root for two slots', () => {
    // The per-index frozen-root check catches this STRICTLY EARLIER than the
    // duplicate-root sweep can: a repeated root is necessarily not the frozen
    // root at one of the two positions. Refused either way, and the earlier
    // gate names the position — which is the more useful refusal.
    const entries = approvalEntriesFor(registry.slots);
    const duplicated = entries.map((entry, index) =>
      index === 1 ? { ...entry, outputRoot: entries[0]!.outputRoot } : entry,
    );
    const decision = composed({ approval: approvalFor(duplicated) });
    expect(decision).toMatchObject({
      failedGate: 'STUDY_APPROVAL',
      refusal: 'APPROVAL_SLOT_FIELD_MISMATCH',
    });
  });

  it('refuses an approval whose statement does not match its own listed entries', () => {
    const entries = approvalEntriesFor(registry.slots);
    const approval = {
      ...approvalFor(entries),
      operatorApprovalStatement: 'I APPROVE EVERYTHING.',
    };
    expect(composed({ approval })).toMatchObject({
      failedGate: 'STUDY_APPROVAL',
      refusal: 'APPROVAL_STATEMENT_MISMATCH',
    });
  });

  it('refuses an approval issued for another execution build', () => {
    const decision = composed({
      approval: approvalFor(approvalEntriesFor(registry.slots), OTHER_BUILD),
    });
    expect(decision).toMatchObject({
      failedGate: 'STUDY_APPROVAL',
      refusal: 'EXECUTION_BUILD_MISMATCH',
    });
  });

  it('refuses when the checked-out HEAD has moved past the approved execution build', () => {
    const decision = composed({
      approval: approvalFor(approvalEntriesFor(registry.slots)),
      head: OTHER_BUILD,
    });
    // The candidate gate reaches HEAD first, so this is where it is named.
    expect(decision).toMatchObject({
      failedGate: 'SLOT_AUTHORISATION',
      refusal: 'EXECUTION_BUILD_MISMATCH',
    });
  });

  it('refuses an approval whose listed SHA matches but whose byte length does not', () => {
    const entries = approvalEntriesFor(registry.slots);
    const wrongLength = entries.map((entry, index) =>
      index === 0
        ? { ...entry, candidateAuthorisationBytes: entry.candidateAuthorisationBytes + 1 }
        : entry,
    );
    const decision = composed({ approval: approvalFor(wrongLength) });
    expect(decision).toMatchObject({
      failedGate: 'APPROVAL_CANDIDATE_MISMATCH',
      refusal: 'APPROVAL_CANDIDATE_BYTES_MISMATCH',
    });
  });

  it('refuses when the approval lists a different candidate for this slot', () => {
    const entries = approvalEntriesFor(registry.slots);
    const foreign = entries.map((entry, index) =>
      index === 0 ? { ...entry, candidateAuthorisationSha256: 'e'.repeat(64) } : entry,
    );
    const decision = composed({ approval: approvalFor(foreign) });
    expect(decision).toMatchObject({
      failedGate: 'APPROVAL_CANDIDATE_MISMATCH',
      refusal: 'APPROVAL_DOES_NOT_LIST_THIS_CANDIDATE',
    });
  });

  it('refuses a superseded F0W/F0X study approval presented in its place', () => {
    const decision = composed({
      approval: { approvalVersion: 'phase2b-2d2c-f0x-study-execution-approval-v1', slots: [] },
    });
    expect(decision).toMatchObject({
      failedGate: 'STUDY_APPROVAL',
      refusal: 'SUPERSEDED_APPROVAL_PRESENTED',
    });
  });
});

describe('2D2C-F3: with no study-level approval, five valid candidates authorise nothing', () => {
  it('the composed decision for slot 1 refuses at STUDY_APPROVAL', () => {
    const decision = composed({ slotId: 'V6_REP_1', approvalPath: null });
    expect(decision).toMatchObject({
      granted: false,
      failedGate: 'STUDY_APPROVAL',
      refusal: 'APPROVAL_PATH_ABSENT',
    });
  });

  it('slots 2..5 refuse EARLIER still, at SEQUENCING, because slot 1 has produced nothing', () => {
    for (const slotId of ['V6_REP_2', 'V6_REP_3', 'V6_REP_4', 'V6_REP_5']) {
      expect(composed({ slotId, approvalPath: null }), slotId).toMatchObject({
        granted: false,
        failedGate: 'SEQUENCING',
        refusal: 'PRIOR_SLOT_NOT_YET_CLASS_C',
      });
    }
  });

  it('the all-five preflight reports the study-approval refusal against every slot', () => {
    const files: Record<string, Buffer> = {};
    for (const slot of registry.slots) {
      files[CANDIDATE_PATH(slot.slotId)] = f3FileBytes(candidateFor(slot.slotId));
    }
    const preflight = runF3AllFivePreflight({
      registry,
      candidatePathForSlot: (slotId) => CANDIDATE_PATH(slotId),
      studyApprovalPath: null,
      readFile: fsOf(files),
      sha256,
      nowUtc: () => NOW,
      currentHead: () => BUILD,
      alreadyConsumed: () => false,
      sequencingProbes: {
        isDirectory: () => false,
        listFilesRecursively: () => [],
        readFile: fsOf(files),
      },
      outputRootProbes: { realpath: (path) => path, isDirectory: () => true },
      forbiddenOutputRootContainers: [REPO_ROOT],
    });
    expect(preflight.granted).toBe(false);
    if (preflight.granted) return;
    expect(preflight.reason).toContain('APPROVAL_PATH_ABSENT');
    expect(preflight.slots).toHaveLength(5);
    for (const slot of preflight.slots) {
      expect(slot.studyApprovalRefusal, slot.slotId).toBe('APPROVAL_PATH_ABSENT');
      expect(slot.candidateGranted, slot.slotId).toBe(true);
      expect(slot.listedInApproval, slot.slotId).toBe(false);
    }
  });
});

describe('2D2C-F3: the output-root gate', () => {
  it('refuses when the slot output root does not exist', () => {
    const decision = composed({
      approval: approvalFor(approvalEntriesFor(registry.slots)),
      outputRootExists: false,
    });
    expect(decision).toMatchObject({ failedGate: 'OUTPUT_ROOT', refusal: 'NOT_A_DIRECTORY' });
  });
});

describe('2D2C-F3: the execution guard never launches, even fully gated', () => {
  const guardInput = (approval: unknown | null) => {
    const files: Record<string, Buffer> = {
      [FREEZE_PATH]: readFileSync(FREEZE_PATH),
      [OWNER_APPROVAL_PATH]: readFileSync(OWNER_APPROVAL_PATH),
    };
    for (const slot of registry.slots) {
      files[CANDIDATE_PATH(slot.slotId)] = f3FileBytes(candidateFor(slot.slotId));
    }
    if (approval !== null) files[APPROVAL_PATH] = f3FileBytes(approval);
    return {
      targetSlotId: 'V6_REP_1',
      registry,
      f2FreezePath: FREEZE_PATH,
      f2OwnerFreezeApprovalPath: OWNER_APPROVAL_PATH,
      candidatePathForSlot: (slotId: string) => CANDIDATE_PATH(slotId),
      studyApprovalPath: approval === null ? null : APPROVAL_PATH,
      readFile: fsOf(files),
      sha256,
      nowUtc: () => NOW,
      currentHead: () => BUILD,
      alreadyConsumed: () => false,
      sequencingProbes: {
        isDirectory: () => false,
        listFilesRecursively: () => [],
        readFile: fsOf(files),
      },
      outputRootProbes: { realpath: (path: string) => path, isDirectory: () => true },
      forbiddenOutputRootContainers: [REPO_ROOT],
    };
  };

  it('refuses at the preflight when no study approval exists, with zero provider requests', () => {
    const outcome = runF3SlotExecution(guardInput(null));
    expect(outcome.launched).toBe(false);
    expect(outcome.stage).toBe('ALL_FIVE_PREFLIGHT');
    expect(outcome.detail).toContain('APPROVAL_PATH_ABSENT');
    expect(outcome.providerRequests).toBe(0);
  });

  it('with EVERY gate satisfied it still refuses at SEMANTIC_DISPATCH_NOT_IMPLEMENTED', () => {
    const outcome = runF3SlotExecution(guardInput(approvalFor(approvalEntriesFor(registry.slots))));
    expect(outcome.launched).toBe(false);
    expect(outcome.stage).toBe('SEMANTIC_DISPATCH_NOT_IMPLEMENTED');
    expect(outcome.providerRequests).toBe(0);
    expect(outcome.composed?.granted).toBe(true);
    expect(outcome.preflight?.granted).toBe(true);
  });

  it('refuses when the approved freeze bytes on disk have drifted', () => {
    const input = guardInput(null);
    const outcome = runF3SlotExecution({
      ...input,
      readFile: (path) =>
        path === FREEZE_PATH ? Buffer.from('{"drifted":true}\n', 'utf8') : input.readFile(path),
    });
    expect(outcome.stage).toBe('FREEZE_IDENTITY');
  });

  it('refuses when the owner freeze-approval record on disk has drifted', () => {
    const input = guardInput(null);
    const outcome = runF3SlotExecution({
      ...input,
      readFile: (path) =>
        path === OWNER_APPROVAL_PATH
          ? Buffer.from('{"drifted":true}\n', 'utf8')
          : input.readFile(path),
    });
    expect(outcome.stage).toBe('OWNER_FREEZE_APPROVAL_IDENTITY');
  });
});

describe('2D2C-F3: the candidate builder is deterministic and slot-scoped', () => {
  it('produces byte-identical candidates for identical inputs', () => {
    for (const slot of registry.slots) {
      const first = f3FileBytes(buildF3SlotCandidate(slot, BUILD, MODEL, ISSUED, VALID_UNTIL));
      const second = f3FileBytes(buildF3SlotCandidate(slot, BUILD, MODEL, ISSUED, VALID_UNTIL));
      expect(sha256(first), slot.slotId).toBe(sha256(second));
    }
  });

  it('produces five pairwise-distinct candidates naming five pairwise-distinct output roots', () => {
    const built = registry.slots.map((slot) =>
      f3FileBytes(buildF3SlotCandidate(slot, BUILD, MODEL, ISSUED, VALID_UNTIL)),
    );
    expect(new Set(built.map((bytes) => sha256(bytes))).size).toBe(5);
    expect(new Set(registry.slots.map((slot) => rootOf(slot))).size).toBe(5);
  });

  it('names the F3 version, the V6 variant, and never a V4/V5 or pair field', () => {
    const candidate = candidateFor('V6_REP_3') as unknown as Record<string, unknown>;
    expect(candidate['authorisationVersion']).toBe(F3_SLOT_AUTHORISATION_VERSION);
    expect(candidate['variantName']).toBe('PROMPT_V6_CANONICAL');
    expect(candidate['pairNumber']).toBeUndefined();
    expect(candidate['historicalAttemptNo']).toBeUndefined();
    expect(Object.keys(candidate['prohibitions'] as object)).toContain('scoring');
    expect(Object.keys(candidate['prohibitions'] as object)).not.toContain(
      'v6OrFutureVariantScheduling',
    );
  });
});

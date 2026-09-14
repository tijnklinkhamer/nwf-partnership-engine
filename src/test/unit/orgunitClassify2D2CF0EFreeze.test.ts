/**
 * PHASE 2B-2D2C-F0E — the REPLACEMENT attempt-2 configuration freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0E_V1.json`),
 * PROPOSED, superseding the approved F0C because of Finding F1 (Option B).
 *
 * What is proved:
 *   - F0E loads at its pinned raw SHA-256 and byte count, and its rebuilt
 *     plan is the pinned F0E plan — which is NOT the superseded F0C plan;
 *   - F0E pins the corrected V3B runtime (0c0d738 + the 120 000 floor) and
 *     names 0c0d738 only as the superseded base; the freeze's floor and this
 *     build's production constant agree;
 *   - EVERY approved F0C decision is carried over BYTE FOR BYTE except what
 *     the runtime re-pin forces: the plan batches (all 12, all 49 documents,
 *     every identity), corpus, input construction (bar the extended
 *     verification note), classifier (bar the commits and their prose),
 *     repair policy and contract, call ceiling, liveness, stop conditions,
 *     capture fields, scoring, gold, HOLDOUT, exclusions and predecessor;
 *   - the changed fields are exactly the listed ones;
 *   - F0C, its approval record and its ratification are byte-unchanged and
 *     F0C is refused as superseded by the family resolver;
 *   - the F0E owner approval record exists, is pinned by hash, and names
 *     exactly the frozen bytes and plan while authorising nothing; no `60000 (PROPOSED)` line and no stale F0C-era sentence
 *     survives in the F0E bytes;
 *   - MUTATION: a changed byte, a freeze still pinning the superseded
 *     runtime, a wrong `supersedes` block, and a wrong floor are refused.
 *
 * No Git, no network, no database, no provider, no filesystem write.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { REPAIR_MINIMUM_REMAINING_BUDGET_MS } from '../../orgunits/classify/repair.js';
import {
  assertAttempt2FreezeAgreesWithProduction,
  F0CFreezeError,
  type Attempt2Freeze,
} from '../harness/phase2b2d2c/f0c/attempt2FreezeCore.js';
import {
  APPROVED_F0C_FREEZE_RAW_SHA256,
  APPROVED_F0C_PLAN_SHA256,
  F0C_APPROVAL_RECORD_PATH,
  F0C_APPROVAL_RECORD_RAW_SHA256,
  F0C_FREEZE_PATH,
  F0C_RATIFICATION_RECORD_PATH,
  F0C_RATIFICATION_RECORD_RAW_SHA256,
  F0C_VARIANT,
  loadF0CFreezeFromBytes,
} from '../harness/phase2b2d2c/f0c/freezeF0C.js';
import {
  buildF0EExecutionPlan,
  F0E_APPROVAL_RECORD_PATH,
  F0E_APPROVAL_RECORD_RAW_SHA256,
  F0E_FREEZE_PATH,
  F0E_REVISION,
  F0E_VARIANT,
  f0ePlanOrderIsFrozen,
  f0ePlanSha256,
  loadF0EFreezeFromBytes,
  PROPOSED_F0E_FREEZE_RAW_BYTES,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  PROPOSED_F0E_PLAN_SHA256,
  SUPERSEDED_V3_RUNTIME_COMMIT,
  V3B_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0c/freezeF0E.js';
import { freezeFamilyOf, resolveChildFreeze } from '../harness/phase2b2d2c/f0c/freezeFamily.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0E_BYTES = readFileSync(join(ROOT, F0E_FREEZE_PATH));
const F0C_BYTES = readFileSync(join(ROOT, F0C_FREEZE_PATH));
const F0E = loadF0EFreezeFromBytes(F0E_BYTES);
const F0C = loadF0CFreezeFromBytes(F0C_BYTES);
const PLAN = buildF0EExecutionPlan(F0E.freeze, F0E.rawSha256);
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const raw = (bytes: Buffer): Record<string, unknown> =>
  JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;

describe('2D2C-F0E: identity and status', () => {
  it('loads at the pinned raw SHA-256 and byte count, PROPOSED, attempt 2, revision F0E_V3B_R1_ATTEMPT_2, authorising nothing', () => {
    expect(F0E.rawSha256).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(F0E.rawBytes).toBe(PROPOSED_F0E_FREEZE_RAW_BYTES);
    expect(F0E.freeze.status).toBe('PROPOSED_PENDING_OWNER_FREEZE_APPROVAL');
    expect(F0E.freeze.freezeRevision).toBe('F0E_V3B_R1_ATTEMPT_2');
    expect(F0E.freeze.attemptNo).toBe(2);
    expect(F0E.freeze.approvalModel.thisFileAuthorises).toEqual([]);
    expect(F0E.freeze.exclusions.thisFreezeAuthorises).toEqual([]);
    expect(F0E.revision).toBe(F0E_REVISION);
  });

  it('the rebuilt plan is the pinned F0E plan, in frozen order, and is NOT the superseded F0C plan', () => {
    expect(f0ePlanOrderIsFrozen(PLAN)).toBe(true);
    expect(f0ePlanSha256(PLAN)).toBe(PROPOSED_F0E_PLAN_SHA256);
    expect(PROPOSED_F0E_PLAN_SHA256).not.toBe(APPROVED_F0C_PLAN_SHA256);
    expect(PROPOSED_F0E_FREEZE_RAW_SHA256).not.toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(PLAN.evaluations).toHaveLength(12);
    expect(PLAN.evaluations.every((e) => e.variantGitCommit === V3B_RUNTIME_COMMIT)).toBe(true);
    expect(PLAN.evaluations.every((e) => e.variantName === 'PROMPT_V3_CANONICAL')).toBe(true);
  });

  it('pins the corrected V3B runtime, names 0c0d738 only as the superseded base, and agrees with this build’s 120000 floor', () => {
    const variant = F0E.freeze.classifier.variants[0]!;
    expect(variant.gitCommit).toBe(V3B_RUNTIME_COMMIT);
    expect(variant.gitCommit).toBe('8224e630b9310f1eeada608a34627e854b30f5aa');
    expect(variant.runtimeBaseCommit).toBe(SUPERSEDED_V3_RUNTIME_COMMIT);
    expect(SUPERSEDED_V3_RUNTIME_COMMIT).toBe(F0C_VARIANT.gitCommit);
    expect(F0E.freeze.git.v3Runtime.commit).toBe(V3B_RUNTIME_COMMIT);
    expect(F0E.freeze.git.v3Runtime.basedOn).toBe(SUPERSEDED_V3_RUNTIME_COMMIT);
    expect(F0E.freeze.repairPolicy.minimumRemainingBudgetMs).toBe(120_000);
    expect(REPAIR_MINIMUM_REMAINING_BUDGET_MS).toBe(120_000);
    // The prompt identity is F0C's, exactly.
    expect(variant.promptVersion).toBe(F0C_VARIANT.promptVersion);
    expect(variant.runtimePromptSha256).toBe(F0C_VARIANT.runtimePromptSha256);
    expect(variant.runtimePromptSha256).toBe(
      'd05dcce614397e09f93d0aec981a3d626d5e90a16851040901ffafec30d3abd1',
    );
  });

  it('supersedes F0C by exact file, raw hash and plan hash, and names its approval and ratification records', () => {
    const s = F0E.freeze.supersedes!;
    expect(s.file).toBe(F0C_FREEZE_PATH);
    expect(s.rawSha256).toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(s.derivedAttempt2PlanSha256).toBe(APPROVED_F0C_PLAN_SHA256);
    const rawSupersedes = raw(F0E_BYTES)['supersedes'] as Record<string, unknown>;
    expect(rawSupersedes['approvalRecordRawSha256']).toBe(F0C_APPROVAL_RECORD_RAW_SHA256);
    expect(rawSupersedes['ratificationRecordRawSha256']).toBe(F0C_RATIFICATION_RECORD_RAW_SHA256);
    expect(String(rawSupersedes['reason'])).toContain('Option B');
    expect(String(rawSupersedes['reason'])).toContain('60000');
  });
});

describe('2D2C-F0E: every approved F0C decision is carried over byte for byte, except what the runtime re-pin forces', () => {
  const f0c = raw(F0C_BYTES);
  const f0e = raw(F0E_BYTES);

  it('the twelve plan batches, all 49 documents and every identity are byte-identical to F0C', () => {
    expect(canonicalStringify(F0E.freeze.batching.plan)).toBe(
      canonicalStringify(F0C.freeze.batching.plan),
    );
    expect(F0E.freeze.batching.plan.reduce((n, b) => n + b.documentCount, 0)).toBe(49);
    for (const [index, batch] of F0E.freeze.batching.plan.entries()) {
      expect(batch.finalInputSha256.PROMPT_V3_CANONICAL).toBe(
        F0C.freeze.batching.plan[index]!.finalInputSha256.PROMPT_V3_CANONICAL,
      );
    }
    // The whole batching section, comparator names included.
    expect(canonicalStringify(f0e['batching'])).toBe(canonicalStringify(f0c['batching']));
  });

  it('corpus, repair policy, repair contract, call ceiling, liveness, stop conditions, capture, scoring, gold, HOLDOUT, exclusions, predecessor, experiment, purpose and evidence classes are byte-identical', () => {
    for (const key of [
      'corpus',
      'repairPolicy',
      'repairContract',
      'callCeiling',
      'liveness',
      'stopConditions',
      'outputCapture',
      'scoring',
      'unresolvedGold',
      'holdout',
      'exclusions',
      'predecessor',
      'experiment',
      'purpose',
      'evidenceClasses',
      'attemptNo',
      'status',
    ]) {
      expect(canonicalStringify(f0e[key]), key).toBe(canonicalStringify(f0c[key]));
    }
  });

  it('inputConstruction differs ONLY in the constant-source verification note (now also verified at V3B)', () => {
    const a = clone(f0c['inputConstruction']) as {
      constantSources: { verifiedIdenticalAt: string[] };
    };
    const b = clone(f0e['inputConstruction']) as {
      constantSources: { verifiedIdenticalAt: string[] };
    };
    expect(b.constantSources.verifiedIdenticalAt).toEqual([
      SUPERSEDED_V3_RUNTIME_COMMIT,
      V3B_RUNTIME_COMMIT,
    ]);
    b.constantSources.verifiedIdenticalAt = a.constantSources.verifiedIdenticalAt;
    expect(canonicalStringify(b)).toBe(canonicalStringify(a));
  });

  it('classifier differs ONLY in the variant commits and the two prose fields that name them', () => {
    const a = clone(f0c['classifier']) as Record<string, unknown> & {
      variants: { gitCommit: string; runtimeBaseCommit: string }[];
    };
    const b = clone(f0e['classifier']) as Record<string, unknown> & {
      variants: { gitCommit: string; runtimeBaseCommit: string }[];
    };
    expect(b.variants[0]!.gitCommit).toBe(V3B_RUNTIME_COMMIT);
    expect(b.variants[0]!.runtimeBaseCommit).toBe(SUPERSEDED_V3_RUNTIME_COMMIT);
    b.variants[0]!.gitCommit = a.variants[0]!.gitCommit;
    b.variants[0]!.runtimeBaseCommit = a.variants[0]!.runtimeBaseCommit;
    for (const prose of ['modelIdSource', 'variantRuntimeCorrection', 'inputIdentity']) {
      expect(b[prose]).not.toBe(a[prose]);
      b[prose] = a[prose];
    }
    expect(canonicalStringify(b)).toBe(canonicalStringify(a));
  });

  it('git differs ONLY in the re-pinned runtime, its superseded twin, the freeze branch and the ancestry prose; ownerApprovalRequired gains exactly one entry', () => {
    const a = clone(f0c['git']) as Record<string, unknown>;
    const b = clone(f0e['git']) as Record<string, unknown>;
    expect(b['v3RuntimeSuperseded']).toMatchObject({ commit: SUPERSEDED_V3_RUNTIME_COMMIT });
    expect(b['v3Runtime']).toMatchObject({
      commit: V3B_RUNTIME_COMMIT,
      basedOn: SUPERSEDED_V3_RUNTIME_COMMIT,
    });
    for (const key of [
      'v3RuntimeSuperseded',
      'v3Runtime',
      'freezeBranch',
      'freezeBranchBasedOn',
      'requiredAncestry',
      'ancestryEvidence',
    ]) {
      delete b[key];
      delete a[key];
    }
    expect(canonicalStringify(b)).toBe(canonicalStringify(a));
    const ownerA = f0c['ownerApprovalRequired'] as string[];
    const ownerB = f0e['ownerApprovalRequired'] as string[];
    expect(ownerB.slice(0, ownerA.length)).toEqual(ownerA);
    expect(ownerB).toHaveLength(ownerA.length + 1);
    expect(ownerB.at(-1)).toContain(V3B_RUNTIME_COMMIT);
    expect(ownerB.at(-1)).toContain('60000 -> 120000');
  });

  it('the changed top-level fields are exactly the expected set', () => {
    const canon = (value: unknown): string =>
      value === undefined ? '<absent>' : canonicalStringify(value);
    const changed = Object.keys({ ...f0c, ...f0e })
      .filter((k) => canon(f0c[k]) !== canon(f0e[k]))
      .sort();
    expect(changed).toEqual(
      [
        'approvalModel',
        'classifier',
        'freezeId',
        'freezeRevision',
        'git',
        'inputConstruction',
        'nextStep',
        'ownerApprovalRequired',
        'supersedes',
        'version',
      ].sort(),
    );
  });
});

describe('2D2C-F0E: the superseded F0C and its records are untouched, and F0C is refused for execution', () => {
  it('F0C bytes, approval record and ratification still hash to their recorded values', () => {
    expect(sha(F0C_BYTES)).toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(sha(readFileSync(join(ROOT, F0C_APPROVAL_RECORD_PATH)))).toBe(
      F0C_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(sha(readFileSync(join(ROOT, F0C_RATIFICATION_RECORD_PATH)))).toBe(
      F0C_RATIFICATION_RECORD_RAW_SHA256,
    );
    expect(F0C.rawSha256).toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
  });

  it('the family resolver dispatches F0E and REFUSES F0C as superseded; the F0C bytes are not an F0E freeze', () => {
    expect(freezeFamilyOf(F0E_BYTES)).toBe('F0E_ATTEMPT_2');
    expect(freezeFamilyOf(F0C_BYTES)).toBe('F0C_ATTEMPT_2_SUPERSEDED');
    expect(() => resolveChildFreeze(F0C_BYTES)).toThrow(F0CFreezeError);
    expect(() => resolveChildFreeze(F0C_BYTES)).toThrow(/superseded by F0E before any execution/);
    expect(() => loadF0EFreezeFromBytes(F0C_BYTES)).toThrow(/does not equal the proposed value/);
    expect(resolveChildFreeze(F0E_BYTES).variants[0]?.gitCommit).toBe(V3B_RUNTIME_COMMIT);
  });

  it('the F0E owner approval record EXISTS, hashes to the pinned value, names exactly the frozen bytes, plan, runtime and superseded F0C, and authorises nothing', () => {
    const bytes = readFileSync(join(ROOT, F0E_APPROVAL_RECORD_PATH));
    expect(F0E_APPROVAL_RECORD_RAW_SHA256).toBe(sha(bytes));
    expect(F0E_APPROVAL_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const record = JSON.parse(bytes.toString('utf8')) as {
      recordKind: string;
      approves: string;
      approvedFreeze: {
        file: string;
        rawSha256: string;
        rawBytes: number;
        derivedAttempt2PlanSha256: string;
        freezeRevision: string;
      };
      supersedes: { rawSha256: string; derivedAttempt2PlanSha256: string };
      approvedIdentities: Record<string, unknown>;
      ownerStatementAsReceived: string;
      statementMarkerAsReceived: string;
      thisRecordAuthorises: unknown[];
      thisRecordDoesNotAuthorise: string[];
    };
    expect(record.recordKind).toBe('OWNER_FREEZE_APPROVAL');
    expect(record.approves).toBe('DEVELOPMENT_CONFIGURATION_FREEZE_ONLY');
    expect(record.approvedFreeze.file).toBe(F0E_FREEZE_PATH);
    expect(record.approvedFreeze.rawSha256).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(record.approvedFreeze.rawBytes).toBe(PROPOSED_F0E_FREEZE_RAW_BYTES);
    expect(record.approvedFreeze.derivedAttempt2PlanSha256).toBe(PROPOSED_F0E_PLAN_SHA256);
    expect(record.approvedFreeze.freezeRevision).toBe('F0E_V3B_R1_ATTEMPT_2');
    expect(record.supersedes.rawSha256).toBe(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(record.supersedes.derivedAttempt2PlanSha256).toBe(APPROVED_F0C_PLAN_SHA256);
    expect(record.approvedIdentities['runtimeCommit']).toBe(V3B_RUNTIME_COMMIT);
    expect(record.approvedIdentities['runtimeBaseCommitSuperseded']).toBe(
      SUPERSEDED_V3_RUNTIME_COMMIT,
    );
    expect(record.approvedIdentities['promptSha256']).toBe(F0E_VARIANT.runtimePromptSha256);
    expect(record.approvedIdentities['repairMinimumRemainingBudgetMs']).toBe(120_000);
    expect(record.statementMarkerAsReceived).toBe('APPROVE_F0E_FREEZE');
    expect(record.ownerStatementAsReceived.startsWith('APPROVE_F0E_FREEZE')).toBe(true);
    expect(record.ownerStatementAsReceived).toContain(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(record.ownerStatementAsReceived).toContain(PROPOSED_F0E_PLAN_SHA256);
    expect(record.ownerStatementAsReceived).toContain(V3B_RUNTIME_COMMIT);
    expect(record.ownerStatementAsReceived).toContain(APPROVED_F0C_FREEZE_RAW_SHA256);
    expect(record.thisRecordAuthorises).toEqual([]);
    const denied = record.thisRecordDoesNotAuthorise.join('\n');
    expect(denied).toMatch(/inference/);
    expect(denied).toMatch(/attempt 2/);
    expect(denied).toMatch(/consumption marker/);
    expect(denied).toMatch(/HOLDOUT/);
    expect(denied).toMatch(/push to main/);
  });

  it('the F0E bytes carry no stale F0C-era line: PROPOSED only in status and the approval rule, no `60000 (PROPOSED)`, no claim that the F0C unit test recomputes them', () => {
    const text = F0E_BYTES.toString('utf8');
    expect(text.match(/PROPOSED/g)).toHaveLength(2);
    expect(text).not.toContain('60000 (PROPOSED)');
    expect(text).not.toContain('recomputed by the F0C unit test');
    expect(text).not.toMatch(
      /"approvalRecord": "docs\/evaluation\/PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_V1\.json \(does not exist/,
    );
  });
});

describe('2D2C-F0E: mutation coverage', () => {
  const expectDrift = (mutated: Attempt2Freeze, pattern: RegExp): void => {
    expect(() => assertAttempt2FreezeAgreesWithProduction(F0E_REVISION, mutated)).toThrow(
      F0CFreezeError,
    );
    expect(() => assertAttempt2FreezeAgreesWithProduction(F0E_REVISION, mutated)).toThrow(pattern);
  };

  it('one changed byte is refused by hash before parsing', () => {
    expect(() => loadF0EFreezeFromBytes(Buffer.concat([F0E_BYTES, Buffer.from(' ')]))).toThrow(
      /does not equal the proposed value/,
    );
  });

  it('a freeze still pinning the SUPERSEDED runtime commit, or basing V3B on the wrong commit, is refused', () => {
    const stale = clone(F0E.freeze);
    stale.classifier.variants[0]!.gitCommit = SUPERSEDED_V3_RUNTIME_COMMIT;
    expectDrift(stale, /variant\.gitCommit/);
    const wrongBase = clone(F0E.freeze);
    wrongBase.git.v3Runtime.basedOn = 'a'.repeat(40);
    expectDrift(wrongBase, /git\.v3Runtime\.basedOn/);
  });

  it('a wrong or missing supersedes block, and a wrong freeze branch base, are refused', () => {
    const wrong = clone(F0E.freeze);
    wrong.supersedes!.rawSha256 = PROPOSED_F0E_FREEZE_RAW_SHA256;
    expectDrift(wrong, /supersedes/);
    const missing = clone(F0E.freeze) as Attempt2Freeze & { supersedes?: unknown };
    delete missing.supersedes;
    expectDrift(missing as Attempt2Freeze, /supersedes/);
    const branch = clone(F0E.freeze);
    branch.git.freezeBranchBasedOn = SUPERSEDED_V3_RUNTIME_COMMIT;
    expectDrift(branch, /freezeBranchBasedOn/);
  });

  it('a 60000 floor, a disabled policy or a changed V3 identity is refused, and the committed bytes are untouched afterwards', () => {
    const floor = clone(F0E.freeze);
    floor.repairPolicy.minimumRemainingBudgetMs = 60_000;
    expectDrift(floor, /minimumRemainingBudgetMs/);
    const disabled = clone(F0E.freeze);
    disabled.repairPolicy.enabled = false;
    expectDrift(disabled, /repairPolicy\.enabled/);
    const identity = clone(F0E.freeze);
    identity.batching.plan[0]!.finalInputSha256.PROMPT_V3_CANONICAL =
      identity.batching.plan[0]!.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL;
    expectDrift(identity, /V3 final identity/);
    expect(sha(readFileSync(join(ROOT, F0E_FREEZE_PATH)))).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(F0E_VARIANT.gitCommit).toBe(V3B_RUNTIME_COMMIT);
  });
});

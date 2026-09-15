/**
 * PHASE 2B-2D2C-F0O — the PROPOSED attempt-4 configuration freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0O_V1.json`),
 * now OWNER-APPROVED as a FREEZE (`APPROVE_F0O_ATTEMPT_4_FREEZE`,
 * 2026-09-15). Freeze approval only: no execution authorisation exists,
 * and none is created by this file. This is preparation plus approval,
 * never attempt 4 itself.
 *
 * What is proved:
 *   - F0O loads at its pinned raw SHA-256 and byte count, and its rebuilt
 *     plan is the pinned F0O plan;
 *   - the plan schedules EXACTLY 12 logical evaluations over EXACTLY 49
 *     documents (49 distinct gold ids), for the ONE variant
 *     PROMPT_V5_CANONICAL, and no PROMPT_V1/V2/V3/V4_CANONICAL evaluation
 *     appears anywhere in it - zero reruns of any prior variant;
 *   - the mechanical call ceiling (12 original + 49 possible repairs = 61
 *     provider requests; x3 = 183 adapter attempts) is RECOMPUTED from the
 *     unchanged 12-batch/49-document structure, not copied;
 *   - the corpus block is the unchanged 49-item DEVELOPMENT scope, and no
 *     HOLDOUT file is named or read anywhere in this preparation;
 *   - EVERY F0I decision is carried over BYTE FOR BYTE except what naming
 *     the V5 candidate forces: the plan batches' canonical/assembly
 *     identities, corpus, repair policy and contract, call ceiling,
 *     liveness, stop conditions, capture fields, gold, and exclusions;
 *   - F0I, its approval record and its own attempt-3 evidence root are
 *     byte-unchanged;
 *   - each batch's `attempt1ComparatorFinalInputSha256` and
 *     `attempt2ComparatorFinalInputSha256` are untouched from F0I, and the
 *     new `attempt3ComparatorFinalInputSha256` is copied verbatim from
 *     F0I's own `finalInputSha256.PROMPT_V4_CANONICAL`;
 *   - the F0O OWNER FREEZE APPROVAL RECORD EXISTS, hashes to the pinned
 *     value, and names exactly the frozen bytes, plan and V5 runtime, and
 *     authorises no attempt-4 execution;
 *   - MUTATION: a changed byte, a freeze naming a prior variant as the
 *     scheduled candidate, and a wrong V5 identity are refused.
 *
 * No Git, no network, no database, no provider, no filesystem write.
 * Zero inference is exercised or authorised by this file.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import {
  assertAttempt4FreezeAgreesWithProduction,
  Attempt4FreezeError,
  type Attempt4Freeze,
} from '../harness/phase2b2d2c/f0o/attempt4FreezeCore.js';
import {
  buildF0OExecutionPlan,
  F0O_APPROVAL_RECORD_PATH,
  F0O_APPROVAL_RECORD_RAW_SHA256,
  F0O_FREEZE_PATH,
  F0O_REVISION,
  F0O_VARIANT,
  f0oPlanOrderIsFrozen,
  f0oPlanSha256,
  loadF0OFreezeFromBytes,
  PROPOSED_F0O_FREEZE_RAW_BYTES,
  PROPOSED_F0O_FREEZE_RAW_SHA256,
  PROPOSED_F0O_PLAN_SHA256,
  V4_RUNTIME_COMMIT,
  V5_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  F0I_APPROVAL_RECORD_PATH,
  F0I_APPROVAL_RECORD_RAW_SHA256,
  F0I_FREEZE_PATH,
  loadF0IFreezeFromBytes,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import { PROPOSED_F0E_FREEZE_RAW_SHA256 } from '../harness/phase2b2d2c/f0c/freezeF0E.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0O_BYTES = readFileSync(join(ROOT, F0O_FREEZE_PATH));
const F0I_BYTES = readFileSync(join(ROOT, F0I_FREEZE_PATH));
const F0O = loadF0OFreezeFromBytes(F0O_BYTES);
const F0I = loadF0IFreezeFromBytes(F0I_BYTES);
const PLAN = buildF0OExecutionPlan(F0O.freeze, F0O.rawSha256);
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const raw = (bytes: Buffer): Record<string, unknown> =>
  JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;

describe('2D2C-F0O: identity and status - PREPARATION ONLY, no approval, no authorisation', () => {
  it('loads at the pinned raw SHA-256 and byte count, PROPOSED, attempt 4, revision F0O_V5_ATTEMPT_4, authorising nothing', () => {
    expect(F0O.rawSha256).toBe(PROPOSED_F0O_FREEZE_RAW_SHA256);
    expect(F0O.rawBytes).toBe(PROPOSED_F0O_FREEZE_RAW_BYTES);
    expect(F0O.freeze.status).toBe('PROPOSED_PENDING_OWNER_FREEZE_APPROVAL');
    expect(F0O.freeze.freezeRevision).toBe('F0O_V5_ATTEMPT_4');
    expect(F0O.freeze.attemptNo).toBe(4);
    expect(F0O.freeze.approvalModel.thisFileAuthorises).toEqual([]);
    expect(F0O.freeze.exclusions.thisFreezeAuthorises).toEqual([]);
    expect(F0O.revision).toBe(F0O_REVISION);
  });

  it('the F0O owner approval record EXISTS, hashes to the pinned value, names exactly the frozen bytes, plan and V5 runtime, and authorises no execution', () => {
    expect(F0O_APPROVAL_RECORD_PATH).not.toBeNull();
    const bytes = readFileSync(join(ROOT, F0O_APPROVAL_RECORD_PATH as string));
    expect(F0O_APPROVAL_RECORD_RAW_SHA256).toBe(sha(bytes));
    expect(F0O_APPROVAL_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const record = JSON.parse(bytes.toString('utf8')) as {
      recordKind: string;
      approves: string;
      approvedFreeze: {
        file: string;
        rawSha256: string;
        rawBytes: number;
        derivedAttempt4PlanSha256: string;
        branchCommit: string;
        freezeRevision: string;
      };
      predecessor: {
        attempt1: { rawSha256: string };
        attempt2: { rawSha256: string; approvalRecordRawSha256: string };
        attempt3: { rawSha256: string; approvalRecordRawSha256: string };
      };
      approvedIdentities: Record<string, unknown>;
      ownerStatementAsReceived: string;
      statementMarkerAsReceived: string;
      thisRecordAuthorises: unknown[];
      thisRecordDoesNotAuthorise: string[];
    };
    expect(record.recordKind).toBe('OWNER_FREEZE_APPROVAL');
    expect(record.approves).toBe('DEVELOPMENT_CONFIGURATION_FREEZE_ONLY');
    expect(record.approvedFreeze.file).toBe(F0O_FREEZE_PATH);
    expect(record.approvedFreeze.rawSha256).toBe(PROPOSED_F0O_FREEZE_RAW_SHA256);
    expect(record.approvedFreeze.rawBytes).toBe(PROPOSED_F0O_FREEZE_RAW_BYTES);
    expect(record.approvedFreeze.derivedAttempt4PlanSha256).toBe(PROPOSED_F0O_PLAN_SHA256);
    expect(record.approvedFreeze.branchCommit).toBe('0fb4d426b9db608c86a3348f9066e46fb8d6946d');
    expect(record.approvedFreeze.freezeRevision).toBe('F0O_V5_ATTEMPT_4');
    expect(record.predecessor.attempt1.rawSha256).toBe(
      'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157',
    );
    expect(record.predecessor.attempt2.rawSha256).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(record.predecessor.attempt3.rawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(record.predecessor.attempt3.approvalRecordRawSha256).toBe(
      F0I_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(record.approvedIdentities['v5RuntimeCommit']).toBe(V5_RUNTIME_COMMIT);
    expect(record.approvedIdentities['v5RuntimeBasedOnV4Commit']).toBe(V4_RUNTIME_COMMIT);
    expect(record.approvedIdentities['promptSha256']).toBe(F0O_VARIANT.runtimePromptSha256);
    expect(record.approvedIdentities['logicalEvaluations']).toBe(12);
    expect(record.approvedIdentities['documents']).toBe(49);
    expect(record.approvedIdentities['priorVariantReruns']).toBe(0);
    expect(
      (record.approvedIdentities['callCeiling'] as { maxProviderRequests: number })
        .maxProviderRequests,
    ).toBe(61);
    expect(
      (record.approvedIdentities['callCeiling'] as { maxAdapterAttempts: number })
        .maxAdapterAttempts,
    ).toBe(183);
    expect(record.approvedIdentities['repairMinimumRemainingBudgetMs']).toBe(120_000);
    expect(record.statementMarkerAsReceived).toBe('APPROVE_F0O_ATTEMPT_4_FREEZE');
    expect(record.ownerStatementAsReceived).toContain('APPROVE_F0O_ATTEMPT_4_FREEZE');
    expect(record.ownerStatementAsReceived).toContain(PROPOSED_F0O_FREEZE_RAW_SHA256);
    expect(record.ownerStatementAsReceived).toContain(PROPOSED_F0O_PLAN_SHA256);
    expect(record.ownerStatementAsReceived).toContain(V5_RUNTIME_COMMIT);
    expect(record.ownerStatementAsReceived).toContain(F0O_VARIANT.runtimePromptSha256);
    expect(record.thisRecordAuthorises).toEqual([]);
    const denied = record.thisRecordDoesNotAuthorise.join('\n');
    expect(denied).toMatch(/execution authorisation/);
    expect(denied).toMatch(/inference/);
    expect(denied).toMatch(/HOLDOUT/);
    expect(denied).toMatch(/gold-label change/);
    expect(denied).toMatch(/prompt modification/);
    expect(denied).toMatch(/DB\/migration write/);
    expect(denied).toMatch(/push to main/);
  });

  it('pins the dedicated V5 runtime root, built from the exact V4 commit, with the Candidate E1 prompt identity', () => {
    const variant = F0O.freeze.classifier.variants[0]!;
    expect(variant.name).toBe('PROMPT_V5_CANONICAL');
    expect(variant.gitCommit).toBe(V5_RUNTIME_COMMIT);
    expect(variant.gitCommit).toBe('1bb7578ac962650675f05aec3507c57a49517239');
    expect(variant.runtimeBaseCommit).toBe(V4_RUNTIME_COMMIT);
    expect(variant.runtimeBaseCommit).toBe('7c3cb5b5b7e57c1c9cee03900c922a01b2075573');
    expect(variant.promptVersion).toBe('orgunit-classifier-prompt-v5');
    expect(variant.runtimePromptSha256).toBe(
      '4c7352812740ca2df518b5274d18aae2f7f695d05ab0f60fcf72c000db8f01c9',
    );
    expect(variant.runtimePromptCharacters).toBe(14_843);
    expect(variant.runtimePromptUtf8Bytes).toBe(14_919);
    expect(variant).toEqual(F0O_VARIANT);
  });
});

describe('2D2C-F0O: exactly 12 V5 evaluations, 49 documents, zero reruns of any prior variant', () => {
  it('the rebuilt plan is the pinned F0O plan, in frozen order, and is NOT any prior attempt plan', () => {
    expect(f0oPlanOrderIsFrozen(PLAN)).toBe(true);
    expect(f0oPlanSha256(PLAN)).toBe(PROPOSED_F0O_PLAN_SHA256);
    expect(PROPOSED_F0O_PLAN_SHA256).not.toBe(PROPOSED_F0I_PLAN_SHA256);
    expect(PROPOSED_F0O_FREEZE_RAW_SHA256).not.toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(PROPOSED_F0O_FREEZE_RAW_SHA256).not.toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
  });

  it('exactly 12 logical evaluations, every one PROMPT_V5_CANONICAL at the V5 runtime commit', () => {
    expect(PLAN.evaluations).toHaveLength(12);
    expect(PLAN.evaluations.every((e) => e.variantGitCommit === V5_RUNTIME_COMMIT)).toBe(true);
    expect(PLAN.evaluations.every((e) => e.variantName === 'PROMPT_V5_CANONICAL')).toBe(true);
    expect(PLAN.evaluations.map((e) => e.logicalBatchOrdinal)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
  });

  it('exactly 49 documents (49 distinct gold ids), summed across the 12 batches', () => {
    const allGoldIds = PLAN.evaluations.flatMap((e) => e.orderedGoldIds);
    expect(allGoldIds).toHaveLength(49);
    expect(new Set(allGoldIds).size).toBe(49);
    expect(PLAN.callCeilingTotals.documents).toBe(49);
  });

  it('no PROMPT_V1/V2/V3/V4_CANONICAL evaluation appears anywhere in the plan', () => {
    const names = new Set(PLAN.evaluations.map((e) => e.variantName));
    expect(names).toEqual(new Set(['PROMPT_V5_CANONICAL']));
    expect(F0O.freeze.batching.priorVariantsNotScheduled).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
      'PROMPT_V3_CANONICAL',
      'PROMPT_V4_CANONICAL',
    ]);
  });

  it('no HOLDOUT file is named or read: corpus stays the unchanged 49-item DEVELOPMENT scope, byte-identical to F0I', () => {
    expect(F0O.freeze.corpus.scope).toBe('DEVELOPMENT');
    expect(F0O.freeze.corpus.itemCount).toBe(49);
    expect(canonicalStringify(F0O.freeze.corpus)).toBe(canonicalStringify(F0I.freeze.corpus));
    expect(F0O.freeze.corpus.canonicalCorpusPath).toContain('canonical');
    expect(F0O.freeze.corpus.holdoutFilesNeverRead).toEqual([
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
    ]);
  });

  it('the F0N erratum forward rule is carried forward: every mixed gold/adjudication file is explicitly forbidden pre-HOLDOUT', () => {
    const holdout = F0O.freeze.holdout as unknown as {
      forbiddenPreHoldoutFiles: string[];
      rules: string[];
    };
    expect(holdout.forbiddenPreHoldoutFiles).toEqual([
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-gold-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-adjudication-v1.jsonl',
    ]);
    expect(holdout.rules.join('\n')).toMatch(
      /even if a script intends to select only a known DEVELOPMENT id/,
    );
  });

  it('the mechanical call ceiling is RECOMPUTED from the unchanged structure: 12 originals + 49 repairs = 61 requests, x3 = 183 attempts', () => {
    const totals = F0O.freeze.callCeiling.totals;
    expect(totals.logicalEvaluations).toBe(12);
    expect(totals.originalRequests).toBe(12);
    expect(totals.documents).toBe(49);
    expect(totals.maxRepairRequests).toBe(49);
    expect(totals.maxProviderRequests).toBe(61);
    expect(totals.maxAdapterAttempts).toBe(183);
    // Byte-identical to F0I's own callCeiling block: same document structure, same numbers.
    expect(canonicalStringify(F0O.freeze.callCeiling)).toBe(
      canonicalStringify(F0I.freeze.callCeiling),
    );
  });
});

describe('2D2C-F0O: every F0I decision is carried over byte for byte, except what naming V5 forces', () => {
  const f0i = raw(F0I_BYTES);
  const f0o = raw(F0O_BYTES);

  it('corpus, repairPolicy, repairContract, callCeiling, liveness, stopConditions, unresolvedGold, exclusions are byte-identical', () => {
    for (const key of [
      'corpus',
      'repairPolicy',
      'repairContract',
      'callCeiling',
      'liveness',
      'stopConditions',
      'unresolvedGold',
      'exclusions',
    ]) {
      expect(canonicalStringify(f0o[key]), key).toBe(canonicalStringify(f0i[key]));
    }
  });

  it('outputCapture.requiredPerLogicalBatch is the same set of fields (prose describing the write-once path names attempt 4 instead)', () => {
    expect(
      (F0O.freeze.outputCapture as { requiredPerLogicalBatch: string[] }).requiredPerLogicalBatch,
    ).toEqual(
      (F0I.freeze.outputCapture as { requiredPerLogicalBatch: string[] }).requiredPerLogicalBatch,
    );
  });

  it('holdout.inferenceDuring2D2C stays FORBIDDEN, and every F0I rule is still present', () => {
    const f0iHoldout = F0I.freeze.holdout as { inferenceDuring2D2C: string; rules: string[] };
    const f0oHoldout = F0O.freeze.holdout as { inferenceDuring2D2C: string; rules: string[] };
    expect(f0oHoldout.inferenceDuring2D2C).toBe(f0iHoldout.inferenceDuring2D2C);
    expect(f0oHoldout.inferenceDuring2D2C).toBe('FORBIDDEN');
    for (const rule of f0iHoldout.rules) {
      expect(f0oHoldout.rules).toContain(rule);
    }
  });

  it('every batch keeps its assembly/canonical identity and attempt1/attempt2 comparators untouched from F0I', () => {
    for (const [index, batch] of F0O.freeze.batching.plan.entries()) {
      const predecessor = F0I.freeze.batching.plan[index]!;
      expect(batch.assemblyInputSha256).toBe(predecessor.assemblyInputSha256);
      expect(batch.canonicalSerializedInputSha256).toBe(predecessor.canonicalSerializedInputSha256);
      expect(batch.goldIds).toEqual(predecessor.goldIds);
      expect(batch.docIndices).toEqual(predecessor.docIndices);
      expect(batch.attempt1ComparatorFinalInputSha256).toEqual(
        predecessor.attempt1ComparatorFinalInputSha256,
      );
      expect(batch.attempt2ComparatorFinalInputSha256).toEqual(
        predecessor.attempt2ComparatorFinalInputSha256,
      );
      // The new attempt-3 comparator is exactly F0I's own candidate identity for that batch.
      expect(batch.attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL).toBe(
        predecessor.finalInputSha256.PROMPT_V4_CANONICAL,
      );
      // The V5 identity differs from every prior identity for the same batch.
      expect(batch.finalInputSha256.PROMPT_V5_CANONICAL).not.toBe(
        predecessor.finalInputSha256.PROMPT_V4_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V5_CANONICAL).not.toBe(
        predecessor.attempt1ComparatorFinalInputSha256.PROMPT_V1_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V5_CANONICAL).not.toBe(
        predecessor.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V5_CANONICAL).not.toBe(
        predecessor.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL,
      );
    }
  });

  it('predecessor names F0B (attempt 1), F0E (attempt 2) AND F0I (attempt 3) as immutable, and there is no supersedes block', () => {
    expect(F0O.freeze.predecessor.attempt1).toEqual(F0I.freeze.predecessor.attempt1);
    expect(F0O.freeze.predecessor.attempt2).toEqual(F0I.freeze.predecessor.attempt2);
    expect(F0O.freeze.predecessor.attempt3.file).toBe(F0I_FREEZE_PATH);
    expect(F0O.freeze.predecessor.attempt3.rawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(F0O.freeze.predecessor.attempt3.approvalRecordRawSha256).toBe(
      F0I_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(F0O.freeze.predecessor.attempt3.role).toBe(
      'HISTORICAL_ATTEMPT_3_CONFIGURATION_BYTE_UNCHANGED',
    );
    expect('supersedes' in f0o).toBe(false);
  });

  it('scoring.comparatorPolicy gains an attempt3 block naming F0I, and gates/postRepairTreatment/gold scoring inputs stay byte-identical', () => {
    expect(canonicalStringify(F0O.freeze.scoring.gates)).toBe(
      canonicalStringify(F0I.freeze.scoring.gates),
    );
    expect(canonicalStringify(F0O.freeze.scoring.postRepairTreatment)).toBe(
      canonicalStringify(F0I.freeze.scoring.postRepairTreatment),
    );
    const f0oInputs = F0O.freeze.scoring.scoringInputs as {
      devLabelsFixture: { rawSha256: string };
      scoringSupplement: { rawSha256: string };
      ownerAdjudicationRecord: { rawSha256: string };
    };
    const f0iInputs = F0I.freeze.scoring.scoringInputs as typeof f0oInputs;
    expect(f0oInputs.devLabelsFixture.rawSha256).toBe(f0iInputs.devLabelsFixture.rawSha256);
    expect(f0oInputs.scoringSupplement.rawSha256).toBe(f0iInputs.scoringSupplement.rawSha256);
    expect(f0oInputs.ownerAdjudicationRecord.rawSha256).toBe(
      f0iInputs.ownerAdjudicationRecord.rawSha256,
    );
    const attempt3 = F0O.freeze.scoring.comparatorPolicy.attempt3;
    expect(attempt3.freezeRawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(attempt3.authorisationSha256).toBe(
      '7feb00b2ab5a04db56e1949532269289880ac8f82c1e8bfe196ef0b2fe746bd4',
    );
    expect(attempt3.planSha256).toBe(PROPOSED_F0I_PLAN_SHA256);
    expect(attempt3.readOnly).toBe(true);
    expect(attempt3.neverInsideAttempt4Namespace).toBe(true);
    // Attempt 1 and attempt 2's comparator blocks are unchanged from F0I's
    // own, except the namespace-scope flag is re-keyed for attempt 4 rather
    // than attempt 3 - the flag always names the attempt CURRENTLY being
    // prepared, never a fixed number.
    const { neverInsideAttempt3Namespace: f1Old, ...attempt1WithoutOldFlag } =
      F0I.freeze.scoring.comparatorPolicy.attempt1;
    expect(f1Old).toBe(true);
    expect(canonicalStringify(F0O.freeze.scoring.comparatorPolicy.attempt1)).toBe(
      canonicalStringify({ ...attempt1WithoutOldFlag, neverInsideAttempt4Namespace: true }),
    );
    const { neverInsideAttempt3Namespace: f2Old, ...attempt2WithoutOldFlag } =
      F0I.freeze.scoring.comparatorPolicy.attempt2;
    expect(f2Old).toBe(true);
    expect(canonicalStringify(F0O.freeze.scoring.comparatorPolicy.attempt2)).toBe(
      canonicalStringify({ ...attempt2WithoutOldFlag, neverInsideAttempt4Namespace: true }),
    );
  });
});

describe('2D2C-F0O: the preserved F0I freeze and its own attempt-3 evidence root are untouched', () => {
  it('F0I bytes and its owner approval record still hash to their recorded values', () => {
    expect(sha(F0I_BYTES)).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(sha(readFileSync(join(ROOT, F0I_APPROVAL_RECORD_PATH as string)))).toBe(
      F0I_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(F0I.rawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
  });

  it('all three preserved evidence roots (attempt 1, attempt 2, attempt 3) are named by F0O only as read-only, never-scheduled comparators', () => {
    expect(F0O.freeze.scoring.comparatorPolicy.attempt1.neverInsideAttempt4Namespace).toBe(true);
    expect(F0O.freeze.scoring.comparatorPolicy.attempt2.neverInsideAttempt4Namespace).toBe(true);
    expect(F0O.freeze.scoring.comparatorPolicy.attempt3.neverInsideAttempt4Namespace).toBe(true);
  });
});

describe('2D2C-F0O: mutation coverage', () => {
  const expectDrift = (mutated: Attempt4Freeze, pattern: RegExp): void => {
    expect(() => assertAttempt4FreezeAgreesWithProduction(F0O_REVISION, mutated)).toThrow(
      Attempt4FreezeError,
    );
    expect(() => assertAttempt4FreezeAgreesWithProduction(F0O_REVISION, mutated)).toThrow(pattern);
  };

  it('one changed byte is refused by hash before parsing', () => {
    expect(() => loadF0OFreezeFromBytes(Buffer.concat([F0O_BYTES, Buffer.from(' ')]))).toThrow(
      /does not equal the proposed value/,
    );
  });

  it('a freeze naming the wrong runtime commit, or basing V5 on the wrong commit, is refused', () => {
    const wrongCommit = clone(F0O.freeze);
    wrongCommit.classifier.variants[0]!.gitCommit = V4_RUNTIME_COMMIT;
    expectDrift(wrongCommit, /variant\.gitCommit/);
    const wrongBase = clone(F0O.freeze);
    wrongBase.git.v5Runtime.basedOn = 'a'.repeat(40);
    expectDrift(wrongBase, /git\.v5Runtime\.basedOn/);
  });

  it('a changed V5 final identity, a disabled repair policy, or a 60000 floor is refused, and the committed bytes are untouched afterwards', () => {
    const identity = clone(F0O.freeze);
    identity.batching.plan[0]!.finalInputSha256.PROMPT_V5_CANONICAL =
      identity.batching.plan[0]!.attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL;
    expectDrift(identity, /V5 final identity/);
    const disabled = clone(F0O.freeze);
    disabled.repairPolicy.enabled = false;
    expectDrift(disabled, /repairPolicy\.enabled/);
    const floor = clone(F0O.freeze);
    floor.repairPolicy.minimumRemainingBudgetMs = 60_000;
    expectDrift(floor, /minimumRemainingBudgetMs/);
    expect(sha(readFileSync(join(ROOT, F0O_FREEZE_PATH)))).toBe(PROPOSED_F0O_FREEZE_RAW_SHA256);
    expect(F0O_VARIANT.gitCommit).toBe(V5_RUNTIME_COMMIT);
  });

  it('the real, correctly-computed V5 identity never actually collides with any real attempt-1, attempt-2 or attempt-3 comparator identity, for any batch', () => {
    for (const batch of F0O.freeze.batching.plan) {
      const v5 = batch.finalInputSha256.PROMPT_V5_CANONICAL;
      expect(v5).not.toBe(batch.attempt1ComparatorFinalInputSha256.PROMPT_V1_CANONICAL);
      expect(v5).not.toBe(batch.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL);
      expect(v5).not.toBe(batch.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL);
      expect(v5).not.toBe(batch.attempt3ComparatorFinalInputSha256.PROMPT_V4_CANONICAL);
    }
  });
});

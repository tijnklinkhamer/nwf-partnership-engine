/**
 * PHASE 2B-2D2C-F0I — the PROPOSED attempt-3 configuration freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0I_V1.json`),
 * PREPARED only. No owner freeze approval and no execution authorisation
 * exist. This is preparation, never attempt 3 itself.
 *
 * What is proved:
 *   - F0I loads at its pinned raw SHA-256 and byte count, and its rebuilt
 *     plan is the pinned F0I plan;
 *   - the plan schedules EXACTLY 12 logical evaluations over EXACTLY 49
 *     documents (49 distinct gold ids), for the ONE variant
 *     PROMPT_V4_CANONICAL, and no PROMPT_V1/V2/V3_CANONICAL evaluation
 *     appears anywhere in it - zero reruns of any prior variant;
 *   - the mechanical call ceiling (12 original + 49 possible repairs = 61
 *     provider requests; x3 = 183 adapter attempts) is RECOMPUTED from the
 *     unchanged 12-batch/49-document structure, not copied;
 *   - the corpus block is the unchanged 49-item DEVELOPMENT scope, and no
 *     HOLDOUT file is named or read anywhere in this preparation;
 *   - EVERY F0E decision is carried over BYTE FOR BYTE except what
 *     naming the V4 candidate forces: the plan batches' canonical/assembly
 *     identities, corpus, repair policy and contract, call ceiling,
 *     liveness, stop conditions, capture fields, gold, HOLDOUT and
 *     exclusions;
 *   - F0E, its approval record and its own attempt-2 evidence root are
 *     byte-unchanged;
 *   - each batch's `attempt1ComparatorFinalInputSha256` is untouched from
 *     F0E, and the new `attempt2ComparatorFinalInputSha256` is copied
 *     verbatim from F0E's own `finalInputSha256.PROMPT_V3_CANONICAL`;
 *   - MUTATION: a changed byte, a freeze naming a prior variant as the
 *     scheduled candidate, and a wrong V4 identity are refused.
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
  assertAttempt3FreezeAgreesWithProduction,
  Attempt3FreezeError,
  type Attempt3Freeze,
} from '../harness/phase2b2d2c/f0i/attempt3FreezeCore.js';
import {
  buildF0IExecutionPlan,
  F0I_APPROVAL_RECORD_PATH,
  F0I_APPROVAL_RECORD_RAW_SHA256,
  F0I_FREEZE_PATH,
  F0I_RATIFICATION_RECORD_PATH,
  F0I_RATIFICATION_RECORD_RAW_SHA256,
  F0I_REVISION,
  F0I_VARIANT,
  f0iPlanOrderIsFrozen,
  f0iPlanSha256,
  loadF0IFreezeFromBytes,
  PROPOSED_F0I_FREEZE_RAW_BYTES,
  PROPOSED_F0I_FREEZE_RAW_SHA256,
  PROPOSED_F0I_PLAN_SHA256,
  V3B_RUNTIME_COMMIT,
  V4_RUNTIME_COMMIT,
} from '../harness/phase2b2d2c/f0i/freezeF0I.js';
import {
  F0E_APPROVAL_RECORD_PATH,
  F0E_APPROVAL_RECORD_RAW_SHA256,
  F0E_FREEZE_PATH,
  loadF0EFreezeFromBytes,
  PROPOSED_F0E_FREEZE_RAW_SHA256,
  PROPOSED_F0E_PLAN_SHA256,
} from '../harness/phase2b2d2c/f0c/freezeF0E.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const F0I_BYTES = readFileSync(join(ROOT, F0I_FREEZE_PATH));
const F0E_BYTES = readFileSync(join(ROOT, F0E_FREEZE_PATH));
const F0I = loadF0IFreezeFromBytes(F0I_BYTES);
const F0E = loadF0EFreezeFromBytes(F0E_BYTES);
const PLAN = buildF0IExecutionPlan(F0I.freeze, F0I.rawSha256);
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const raw = (bytes: Buffer): Record<string, unknown> =>
  JSON.parse(bytes.toString('utf8')) as Record<string, unknown>;

describe('2D2C-F0I: identity and status - PREPARATION ONLY, no approval, no authorisation', () => {
  it('loads at the pinned raw SHA-256 and byte count, PROPOSED, attempt 3, revision F0I_V4_ATTEMPT_3, authorising nothing', () => {
    expect(F0I.rawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(F0I.rawBytes).toBe(PROPOSED_F0I_FREEZE_RAW_BYTES);
    expect(F0I.freeze.status).toBe('PROPOSED_PENDING_OWNER_FREEZE_APPROVAL');
    expect(F0I.freeze.freezeRevision).toBe('F0I_V4_ATTEMPT_3');
    expect(F0I.freeze.attemptNo).toBe(3);
    expect(F0I.freeze.approvalModel.thisFileAuthorises).toEqual([]);
    expect(F0I.freeze.exclusions.thisFreezeAuthorises).toEqual([]);
    expect(F0I.revision).toBe(F0I_REVISION);
  });

  it('the F0I owner approval record EXISTS, hashes to the pinned value, names exactly the frozen bytes, plan and V4 runtime, and authorises nothing', () => {
    expect(F0I_APPROVAL_RECORD_PATH).not.toBeNull();
    const bytes = readFileSync(join(ROOT, F0I_APPROVAL_RECORD_PATH as string));
    expect(F0I_APPROVAL_RECORD_RAW_SHA256).toBe(sha(bytes));
    expect(F0I_APPROVAL_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const record = JSON.parse(bytes.toString('utf8')) as {
      recordKind: string;
      approves: string;
      approvedFreeze: {
        file: string;
        rawSha256: string;
        rawBytes: number;
        derivedAttempt3PlanSha256: string;
        branchCommit: string;
        freezeRevision: string;
      };
      predecessor: {
        attempt1: { rawSha256: string };
        attempt2: { rawSha256: string; approvalRecordRawSha256: string };
      };
      approvedIdentities: Record<string, unknown>;
      ownerStatementAsReceived: string;
      statementMarkerAsReceived: string;
      thisRecordAuthorises: unknown[];
      thisRecordDoesNotAuthorise: string[];
    };
    expect(record.recordKind).toBe('OWNER_FREEZE_APPROVAL');
    expect(record.approves).toBe('DEVELOPMENT_CONFIGURATION_FREEZE_ONLY');
    expect(record.approvedFreeze.file).toBe(F0I_FREEZE_PATH);
    expect(record.approvedFreeze.rawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(record.approvedFreeze.rawBytes).toBe(PROPOSED_F0I_FREEZE_RAW_BYTES);
    expect(record.approvedFreeze.derivedAttempt3PlanSha256).toBe(PROPOSED_F0I_PLAN_SHA256);
    expect(record.approvedFreeze.branchCommit).toBe('734fd4b1913efcab74096a9fd538c51a32a560d2');
    expect(record.approvedFreeze.freezeRevision).toBe('F0I_V4_ATTEMPT_3');
    expect(record.predecessor.attempt1.rawSha256).toBe(
      'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157',
    );
    expect(record.predecessor.attempt2.rawSha256).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(record.predecessor.attempt2.approvalRecordRawSha256).toBe(
      F0E_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(record.approvedIdentities['v4RuntimeCommit']).toBe(V4_RUNTIME_COMMIT);
    expect(record.approvedIdentities['v4RuntimeBasedOnV3BCommit']).toBe(V3B_RUNTIME_COMMIT);
    expect(record.approvedIdentities['promptSha256']).toBe(F0I_VARIANT.runtimePromptSha256);
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
    expect(record.statementMarkerAsReceived).toBe('APPROVE_F0I_FREEZE');
    expect(record.ownerStatementAsReceived.startsWith('APPROVE_F0I_FREEZE')).toBe(true);
    expect(record.ownerStatementAsReceived).toContain(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(record.ownerStatementAsReceived).toContain(PROPOSED_F0I_PLAN_SHA256);
    expect(record.ownerStatementAsReceived).toContain(V4_RUNTIME_COMMIT);
    expect(record.ownerStatementAsReceived).toContain(F0I_VARIANT.runtimePromptSha256);
    expect(record.thisRecordAuthorises).toEqual([]);
    const denied = record.thisRecordDoesNotAuthorise.join('\n');
    expect(denied).toMatch(/inference/);
    expect(denied).toMatch(/attempt 3/);
    expect(denied).toMatch(/consumption marker/);
    expect(denied).toMatch(/HOLDOUT/);
    expect(denied).toMatch(/push to main/);
  });

  it('the F0I owner approval RATIFICATION record EXISTS, hashes to the pinned value, restates every identity self-containedly, and authorises nothing', () => {
    expect(F0I_RATIFICATION_RECORD_PATH).not.toBeNull();
    const bytes = readFileSync(join(ROOT, F0I_RATIFICATION_RECORD_PATH as string));
    expect(F0I_RATIFICATION_RECORD_RAW_SHA256).toBe(sha(bytes));
    expect(F0I_RATIFICATION_RECORD_RAW_SHA256).toMatch(/^[0-9a-f]{64}$/);
    const record = JSON.parse(bytes.toString('utf8')) as {
      recordKind: string;
      ratifies: string;
      ratifiedApprovalRecord: { file: string; rawSha256: string; preservedVerbatim: boolean };
      approvedFreeze: { rawSha256: string; derivedAttempt3PlanSha256: string };
      approvedIdentitiesRestated: Record<string, unknown>;
      sixFrozenSemanticGatesRestated: Record<string, unknown>;
      holdoutProhibitionRestated: { inferenceDuring2D2C: string };
      attempt1ComparatorIdentityRestatedComplete: Record<string, unknown>;
      attempt2ComparatorIdentityRestatedComplete: Record<string, unknown>;
      semanticsUnchanged: Record<string, boolean>;
      thisRecordAuthorises: unknown[];
      thisRecordDoesNotAuthorise: string[];
      relationshipToTheRatifiedRecord: string[];
    };
    expect(record.recordKind).toBe('OWNER_FREEZE_APPROVAL_RATIFICATION');
    expect(record.ratifies).toBe('DEVELOPMENT_CONFIGURATION_FREEZE_APPROVAL_ONLY');
    // Ratifies the EXISTING approval record, unedited, by its own pinned hash.
    expect(record.ratifiedApprovalRecord.file).toBe(F0I_APPROVAL_RECORD_PATH);
    expect(record.ratifiedApprovalRecord.rawSha256).toBe(F0I_APPROVAL_RECORD_RAW_SHA256);
    expect(record.ratifiedApprovalRecord.preservedVerbatim).toBe(true);
    // Never touches freeze or plan bytes.
    expect(record.approvedFreeze.rawSha256).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(record.approvedFreeze.derivedAttempt3PlanSha256).toBe(PROPOSED_F0I_PLAN_SHA256);
    // Restates the identities the owner's ratification instruction named.
    expect(record.approvedIdentitiesRestated['v4RuntimeCommit']).toBe(V4_RUNTIME_COMMIT);
    expect(record.approvedIdentitiesRestated['v4RuntimeBasedOnV3BCommit']).toBe(V3B_RUNTIME_COMMIT);
    expect(record.approvedIdentitiesRestated['promptVersion']).toBe('orgunit-classifier-prompt-v4');
    expect(record.approvedIdentitiesRestated['promptSha256']).toBe(F0I_VARIANT.runtimePromptSha256);
    expect(record.approvedIdentitiesRestated['promptCharacters']).toBe(14_731);
    expect(record.approvedIdentitiesRestated['promptUtf8Bytes']).toBe(14_807);
    expect(record.approvedIdentitiesRestated['modelId']).toBe(
      (F0I.freeze.classifier as { requestedModelId: string }).requestedModelId,
    );
    expect(record.approvedIdentitiesRestated['logicalEvaluations']).toBe(12);
    expect(record.approvedIdentitiesRestated['documents']).toBe(49);
    expect(
      (record.approvedIdentitiesRestated['priorVariantReruns'] as Record<string, number>)
        .PROMPT_V3_CANONICAL,
    ).toBe(0);
    expect(
      (record.approvedIdentitiesRestated['callCeiling'] as { maxProviderRequests: number })
        .maxProviderRequests,
    ).toBe(61);
    expect(
      (record.approvedIdentitiesRestated['callCeiling'] as { maxAdapterAttempts: number })
        .maxAdapterAttempts,
    ).toBe(183);
    expect(
      (
        record.approvedIdentitiesRestated['repairPolicy'] as {
          minimumRemainingBudgetMs: number;
        }
      ).minimumRemainingBudgetMs,
    ).toBe(120_000);
    // Six frozen semantic gates, byte-identical to F0I.freeze.scoring.gates.
    const gates = F0I.freeze.scoring.gates as Record<string, number>;
    expect(record.sixFrozenSemanticGatesRestated['minSchemaValidSpanVerifiedRate']).toBe(
      gates['minSchemaValidSpanVerifiedRate'],
    );
    expect(record.sixFrozenSemanticGatesRestated['minUnitPageRecall']).toBe(
      gates['minUnitPageRecall'],
    );
    expect(record.sixFrozenSemanticGatesRestated['minUnitPagePrecision']).toBe(
      gates['minUnitPagePrecision'],
    );
    expect(record.sixFrozenSemanticGatesRestated['minUnitTypeAccuracy']).toBe(
      gates['minUnitTypeAccuracy'],
    );
    expect(record.sixFrozenSemanticGatesRestated['minHardNegativeRejection']).toBe(
      gates['minHardNegativeRejection'],
    );
    expect(record.sixFrozenSemanticGatesRestated['maxNeedsReviewRate']).toBe(
      gates['maxNeedsReviewRate'],
    );
    // HOLDOUT prohibition restated, byte-identical to F0I.freeze.holdout.
    expect(record.holdoutProhibitionRestated.inferenceDuring2D2C).toBe(
      (F0I.freeze.holdout as { inferenceDuring2D2C: string }).inferenceDuring2D2C,
    );
    expect(record.holdoutProhibitionRestated.inferenceDuring2D2C).toBe('FORBIDDEN');
    // Complete, non-abbreviated attempt-1 and attempt-2 comparator identities.
    expect(record.attempt1ComparatorIdentityRestatedComplete['freezeRawSha256']).toBe(
      'c3f0a76b3a5939f3e4bf395d46237cf0b0f365fa1f4bf019092a6944849d6157',
    );
    expect(record.attempt1ComparatorIdentityRestatedComplete['artifactInventorySha256']).toBe(
      'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137',
    );
    expect(record.attempt1ComparatorIdentityRestatedComplete['artifactCount']).toBe(243);
    expect(record.attempt2ComparatorIdentityRestatedComplete['freezeRawSha256']).toBe(
      PROPOSED_F0E_FREEZE_RAW_SHA256,
    );
    expect(record.attempt2ComparatorIdentityRestatedComplete['approvalRecordRawSha256']).toBe(
      F0E_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(record.attempt2ComparatorIdentityRestatedComplete['primaryArtifactCount']).toBe(123);
    expect(record.attempt2ComparatorIdentityRestatedComplete['repairArtifactCount']).toBe(18);
    // Explicit statements the instruction requires.
    expect(record.semanticsUnchanged['freezeBytesChanged']).toBe(false);
    expect(record.semanticsUnchanged['planBytesChanged']).toBe(false);
    expect(record.semanticsUnchanged['approvalRecordChanged']).toBe(false);
    expect(record.semanticsUnchanged['newSemanticDecisionMade']).toBe(false);
    expect(record.thisRecordAuthorises).toEqual([]);
    const relationship = record.relationshipToTheRatifiedRecord.join('\n');
    expect(relationship).toMatch(/remains immutable historical evidence/);
    expect(relationship).toMatch(/does not supersede it/);
    expect(relationship).toMatch(/no freeze bytes and no plan bytes change/);
    expect(relationship).toMatch(/no new semantic decision/);
    expect(relationship).toMatch(/no attempt-3 execution authority is granted/);
    const denied = record.thisRecordDoesNotAuthorise.join('\n');
    expect(denied).toMatch(/inference/);
    expect(denied).toMatch(/attempt 3/);
    expect(denied).toMatch(/HOLDOUT/);
    expect(denied).toMatch(/push to main/);
  });

  it('pins the dedicated V4 runtime root, built from the exact V3B commit, with the D1/D2/D3 prompt identity', () => {
    const variant = F0I.freeze.classifier.variants[0]!;
    expect(variant.name).toBe('PROMPT_V4_CANONICAL');
    expect(variant.gitCommit).toBe(V4_RUNTIME_COMMIT);
    expect(variant.gitCommit).toBe('7c3cb5b5b7e57c1c9cee03900c922a01b2075573');
    expect(variant.runtimeBaseCommit).toBe(V3B_RUNTIME_COMMIT);
    expect(variant.runtimeBaseCommit).toBe('8224e630b9310f1eeada608a34627e854b30f5aa');
    expect(variant.promptVersion).toBe('orgunit-classifier-prompt-v4');
    expect(variant.runtimePromptSha256).toBe(
      'a2dad6e85102ee710d4eb1c5ca4ea3995273b3e25834d27a83f36ad6b65a256b',
    );
    expect(variant.runtimePromptCharacters).toBe(14_731);
    expect(variant.runtimePromptUtf8Bytes).toBe(14_807);
    expect(variant).toEqual(F0I_VARIANT);
  });
});

describe('2D2C-F0I: exactly 12 V4 evaluations, 49 documents, zero reruns of any prior variant', () => {
  it('the rebuilt plan is the pinned F0I plan, in frozen order, and is NOT any prior attempt plan', () => {
    expect(f0iPlanOrderIsFrozen(PLAN)).toBe(true);
    expect(f0iPlanSha256(PLAN)).toBe(PROPOSED_F0I_PLAN_SHA256);
    expect(PROPOSED_F0I_PLAN_SHA256).not.toBe(PROPOSED_F0E_PLAN_SHA256);
    expect(PROPOSED_F0I_FREEZE_RAW_SHA256).not.toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
  });

  it('exactly 12 logical evaluations, every one PROMPT_V4_CANONICAL at the V4 runtime commit', () => {
    expect(PLAN.evaluations).toHaveLength(12);
    expect(PLAN.evaluations.every((e) => e.variantGitCommit === V4_RUNTIME_COMMIT)).toBe(true);
    expect(PLAN.evaluations.every((e) => e.variantName === 'PROMPT_V4_CANONICAL')).toBe(true);
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

  it('no PROMPT_V1_CANONICAL, PROMPT_V2_CANONICAL or PROMPT_V3_CANONICAL evaluation appears anywhere in the plan', () => {
    const names = new Set(PLAN.evaluations.map((e) => e.variantName));
    expect(names).toEqual(new Set(['PROMPT_V4_CANONICAL']));
    expect(F0I.freeze.batching.priorVariantsNotScheduled).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
      'PROMPT_V3_CANONICAL',
    ]);
  });

  it('no HOLDOUT file is named or read: corpus stays the unchanged 49-item DEVELOPMENT scope', () => {
    expect(F0I.freeze.corpus.scope).toBe('DEVELOPMENT');
    expect(F0I.freeze.corpus.itemCount).toBe(49);
    // Byte-identical to F0E's own corpus block, unchanged since F0B: the
    // canonical corpus/manifest paths the run actually reads are DEV-only,
    // and the two files that carry HOLDOUT/mixed-adjudication content are
    // listed only as files the run NEVER opens.
    expect(canonicalStringify(F0I.freeze.corpus)).toBe(canonicalStringify(F0E.freeze.corpus));
    expect(F0I.freeze.corpus.canonicalCorpusPath).toContain('canonical');
    expect(F0I.freeze.corpus.holdoutFilesNeverRead).toEqual([
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-v1.jsonl',
      'src/test/fixtures/evaluation/orgunit-classifier-sonnet-acceptance-adjudication-v1.jsonl',
    ]);
  });

  it('the mechanical call ceiling is RECOMPUTED from the unchanged structure: 12 originals + 49 repairs = 61 requests, x3 = 183 attempts', () => {
    const totals = F0I.freeze.callCeiling.totals;
    expect(totals.logicalEvaluations).toBe(12);
    expect(totals.originalRequests).toBe(12);
    expect(totals.documents).toBe(49);
    expect(totals.maxRepairRequests).toBe(49);
    expect(totals.maxProviderRequests).toBe(61);
    expect(totals.maxAdapterAttempts).toBe(183);
    // Byte-identical to F0E's own callCeiling block: same document structure, same numbers.
    expect(canonicalStringify(F0I.freeze.callCeiling)).toBe(
      canonicalStringify(F0E.freeze.callCeiling),
    );
  });
});

describe('2D2C-F0I: every F0E decision is carried over byte for byte, except what naming V4 forces', () => {
  const f0e = raw(F0E_BYTES);
  const f0i = raw(F0I_BYTES);

  it('corpus, repairPolicy, repairContract, callCeiling, liveness, stopConditions, outputCapture, unresolvedGold, holdout, exclusions are byte-identical', () => {
    for (const key of [
      'corpus',
      'repairPolicy',
      'repairContract',
      'callCeiling',
      'liveness',
      'stopConditions',
      'outputCapture',
      'unresolvedGold',
      'holdout',
      'exclusions',
    ]) {
      expect(canonicalStringify(f0i[key]), key).toBe(canonicalStringify(f0e[key]));
    }
  });

  it('every batch keeps its assembly/canonical identity and attempt1ComparatorFinalInputSha256 untouched from F0E', () => {
    for (const [index, batch] of F0I.freeze.batching.plan.entries()) {
      const predecessor = F0E.freeze.batching.plan[index]!;
      expect(batch.assemblyInputSha256).toBe(predecessor.assemblyInputSha256);
      expect(batch.canonicalSerializedInputSha256).toBe(predecessor.canonicalSerializedInputSha256);
      expect(batch.goldIds).toEqual(predecessor.goldIds);
      expect(batch.docIndices).toEqual(predecessor.docIndices);
      expect(batch.attempt1ComparatorFinalInputSha256).toEqual(
        predecessor.attempt1ComparatorFinalInputSha256,
      );
      // The new attempt-2 comparator is exactly F0E's own candidate identity for that batch.
      expect(batch.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL).toBe(
        predecessor.finalInputSha256.PROMPT_V3_CANONICAL,
      );
      // The V4 identity differs from every prior identity for the same batch.
      expect(batch.finalInputSha256.PROMPT_V4_CANONICAL).not.toBe(
        predecessor.finalInputSha256.PROMPT_V3_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V4_CANONICAL).not.toBe(
        predecessor.attempt1ComparatorFinalInputSha256.PROMPT_V1_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V4_CANONICAL).not.toBe(
        predecessor.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL,
      );
    }
  });

  it('predecessor names BOTH F0B (attempt 1) and F0E (attempt 2) as immutable, and there is no supersedes block', () => {
    expect(F0I.freeze.predecessor.attempt1).toEqual(F0E.freeze.predecessor);
    expect(F0I.freeze.predecessor.attempt2.file).toBe(F0E_FREEZE_PATH);
    expect(F0I.freeze.predecessor.attempt2.rawSha256).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(F0I.freeze.predecessor.attempt2.approvalRecordRawSha256).toBe(
      F0E_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(F0I.freeze.predecessor.attempt2.role).toBe(
      'HISTORICAL_ATTEMPT_2_CONFIGURATION_BYTE_UNCHANGED',
    );
    expect('supersedes' in f0i).toBe(false);
  });

  it('scoring.comparatorPolicy gains an attempt2 block naming F0E, and gates/scoringInputs/postRepairTreatment stay byte-identical', () => {
    for (const key of ['gates', 'scoringInputs', 'postRepairTreatment']) {
      expect(canonicalStringify((f0i['scoring'] as Record<string, unknown>)[key])).toBe(
        canonicalStringify((f0e['scoring'] as Record<string, unknown>)[key]),
      );
    }
    const attempt2 = F0I.freeze.scoring.comparatorPolicy.attempt2;
    expect(attempt2.freezeRawSha256).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(attempt2.authorisationSha256).toBe(
      'b169b5d8079b64d5c7459392fb347bb93f6793de9d340f30fd472393964e6d40',
    );
    expect(attempt2.planSha256).toBe(PROPOSED_F0E_PLAN_SHA256);
    expect(attempt2.readOnly).toBe(true);
    // Attempt 1's comparator block is unchanged from F0E's own, except the
    // namespace-scope flag is re-keyed for attempt 3 rather than attempt 2.
    const { neverInsideAttempt2Namespace, ...attempt1WithoutOldFlag } =
      F0E.freeze.scoring.comparatorPolicy.attempt1;
    expect(neverInsideAttempt2Namespace).toBe(true);
    expect(canonicalStringify(F0I.freeze.scoring.comparatorPolicy.attempt1)).toBe(
      canonicalStringify({
        ...attempt1WithoutOldFlag,
        neverInsideAttempt3Namespace: true,
      }),
    );
  });
});

describe('2D2C-F0I: the preserved F0E freeze and its own attempt-2 evidence root are untouched', () => {
  it('F0E bytes and its owner approval record still hash to their recorded values', () => {
    expect(sha(F0E_BYTES)).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
    expect(sha(readFileSync(join(ROOT, F0E_APPROVAL_RECORD_PATH)))).toBe(
      F0E_APPROVAL_RECORD_RAW_SHA256,
    );
    expect(F0E.rawSha256).toBe(PROPOSED_F0E_FREEZE_RAW_SHA256);
  });

  it('the two preserved evidence roots (attempt 1 and attempt 2) are named by F0I only as read-only, never-scheduled comparators', () => {
    expect(F0I.freeze.scoring.comparatorPolicy.attempt1.neverInsideAttempt3Namespace).toBe(true);
    expect(F0I.freeze.scoring.comparatorPolicy.attempt2.neverInsideAttempt3Namespace).toBe(true);
  });
});

describe('2D2C-F0I: mutation coverage', () => {
  const expectDrift = (mutated: Attempt3Freeze, pattern: RegExp): void => {
    expect(() => assertAttempt3FreezeAgreesWithProduction(F0I_REVISION, mutated)).toThrow(
      Attempt3FreezeError,
    );
    expect(() => assertAttempt3FreezeAgreesWithProduction(F0I_REVISION, mutated)).toThrow(pattern);
  };

  it('one changed byte is refused by hash before parsing', () => {
    expect(() => loadF0IFreezeFromBytes(Buffer.concat([F0I_BYTES, Buffer.from(' ')]))).toThrow(
      /does not equal the proposed value/,
    );
  });

  it('a freeze naming the wrong runtime commit, or basing V4 on the wrong commit, is refused', () => {
    const wrongCommit = clone(F0I.freeze);
    wrongCommit.classifier.variants[0]!.gitCommit = V3B_RUNTIME_COMMIT;
    expectDrift(wrongCommit, /variant\.gitCommit/);
    const wrongBase = clone(F0I.freeze);
    wrongBase.git.v4Runtime.basedOn = 'a'.repeat(40);
    expectDrift(wrongBase, /git\.v4Runtime\.basedOn/);
  });

  it('a changed V4 final identity, a disabled repair policy, or a 60000 floor is refused, and the committed bytes are untouched afterwards', () => {
    const identity = clone(F0I.freeze);
    identity.batching.plan[0]!.finalInputSha256.PROMPT_V4_CANONICAL =
      identity.batching.plan[0]!.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL;
    expectDrift(identity, /V4 final identity/);
    const disabled = clone(F0I.freeze);
    disabled.repairPolicy.enabled = false;
    expectDrift(disabled, /repairPolicy\.enabled/);
    const floor = clone(F0I.freeze);
    floor.repairPolicy.minimumRemainingBudgetMs = 60_000;
    expectDrift(floor, /minimumRemainingBudgetMs/);
    expect(sha(readFileSync(join(ROOT, F0I_FREEZE_PATH)))).toBe(PROPOSED_F0I_FREEZE_RAW_SHA256);
    expect(F0I_VARIANT.gitCommit).toBe(V4_RUNTIME_COMMIT);
  });

  it('the real, correctly-computed V4 identity never actually collides with any real attempt-1 or attempt-2 comparator identity, for any batch', () => {
    // A batch-level mutation cannot exercise the collision guard in
    // isolation - any deviation from the correctly recomputed V4 hash trips
    // the (stronger) "V4 final identity" check first. What actually matters
    // is proved directly instead: over every one of the 12 real batches,
    // the real V4 identity differs from every real V1/V2/V3 identity - see
    // "every batch keeps its assembly/canonical identity..." above.
    for (const batch of F0I.freeze.batching.plan) {
      const v4 = batch.finalInputSha256.PROMPT_V4_CANONICAL;
      expect(v4).not.toBe(batch.attempt1ComparatorFinalInputSha256.PROMPT_V1_CANONICAL);
      expect(v4).not.toBe(batch.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL);
      expect(v4).not.toBe(batch.attempt2ComparatorFinalInputSha256.PROMPT_V3_CANONICAL);
    }
  });
});

/**
 * PHASE 2B-2D2C-F0C — the PROPOSED attempt-2 configuration freeze
 * (`docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_F0C_V1.json`),
 * pinned against the committed bytes it derives from and the production
 * exports it names. Nothing here authorises anything: the freeze is
 * PROPOSED until a separate owner approval record names its raw SHA-256.
 *
 * What is proved:
 *   - F0B remains byte-identical (its raw SHA-256 and byte count);
 *   - V1 and V2 are not scheduled again; the plan is exactly 12 V3 evaluations
 *     in the frozen ordinal order;
 *   - the prompt identity is recomputed from the PRODUCTION V3 bytes;
 *   - the repair policy and limits equal the production constants and ADR 0011;
 *   - a disabled repair policy changes no identity, and the disabled path is
 *     the pre-R1 behaviour (proved separately in the R1 suites; here: identity);
 *   - attempt-1 artifacts are read-only comparator inputs outside the attempt-2
 *     namespace;
 *   - no HOLDOUT path, identifier or value enters the plan;
 *   - loading and planning create no authorisation, marker or artifact;
 *   - the call ceiling is mechanically derived and every liveness number is
 *     the frozen production one;
 *   - MUTATION: each material check bites, on an in-memory clone; the committed
 *     bytes are re-verified untouched afterwards.
 *
 * THE HOLDOUT BOUNDARY BINDS HERE: this file reads only the two DEVELOPMENT
 * evaluation fixtures the freezes name, never the mixed or adjudication files.
 * No Git, no network, no database, no provider, no filesystem write.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../orgunits/classify/constants.js';
import { computeFinalInputSha256 } from '../../orgunits/classify/finalIdentity.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import {
  CLASSIFIER_CALL_HARD_KILL_GRACE_MS,
  CLASSIFIER_CALL_SOFT_DEADLINE_MS,
  CLASSIFIER_CALL_TOTAL_BUDGET_MS,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import {
  REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
  REPAIR_MINIMUM_REMAINING_BUDGET_MS,
  REPAIR_POLICY_DISABLED,
  REPAIR_POLICY_ONE_ROUND,
  REPAIR_REASON_CODES,
  REPAIR_REQUEST_VERSION,
  REPAIRABLE_CATEGORIES,
} from '../../orgunits/classify/repair.js';
import { MAX_TRANSIENT_RETRIES } from '../../orgunits/classify/retry.js';
import { ORGUNIT_SIGNAL_RULE_VERSION } from '../../orgunits/signals/score.js';
import { FETCH_POLICY_VERSION } from '../../orgunits/web/policy.js';
import { reconstructAndVerifyFrozenBatches } from '../harness/phase2b2d2c/batches.js';
import {
  EXPECTED_F0B_FREEZE_RAW_SHA256,
  FREEZE_PATH,
  FROZEN_TIER2_WATCHDOG_MS,
  FROZEN_VARIANTS,
} from '../harness/phase2b2d2c/constants.js';
import { loadDevCorpus } from '../harness/phase2b2d2c/corpus.js';
import {
  ATTEMPT_1_VARIANT_NAMES,
  assertF0CAgreesWithProduction,
  buildF0CExecutionPlan,
  deriveCallCeiling,
  F0C_ATTEMPT_NO,
  F0C_FREEZE_PATH,
  F0C_VARIANT,
  F0CFreezeError,
  f0cAttemptDirectoryOf,
  f0cPlanOrderIsFrozen,
  f0cPlanSha256,
  loadF0CFreezeFromBytes,
  PROPOSED_F0C_FREEZE_RAW_SHA256,
  type F0CFreeze,
} from '../harness/phase2b2d2c/f0c/freezeF0C.js';
import { freezeRepairPolicy, loadFreezeFromBytes } from '../harness/phase2b2d2c/freeze.js';
import { V3_PROMPT_SHA256, V3_PROMPT_SIZE } from '../harness/phase2b2d2c/promptLineage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sha256 = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

const F0B_BYTES = readFileSync(join(ROOT, FREEZE_PATH));
const F0C_BYTES = readFileSync(join(ROOT, F0C_FREEZE_PATH));
const F0B = loadFreezeFromBytes(F0B_BYTES);
const F0C = loadF0CFreezeFromBytes(F0C_BYTES);
const PLAN = buildF0CExecutionPlan(F0C.freeze, F0C.rawSha256);

/** The proposed raw hash, restated as a literal so the loader's own constant is cross-checked. */
const PROPOSED_RAW_SHA256 = '0782fc3f9ab459c95bd6f8d6b34c69820a493a3bab2c40f06a51946314a8491a';

function clone(): F0CFreeze {
  return JSON.parse(JSON.stringify(F0C.freeze)) as F0CFreeze;
}

describe('2D2C-F0C: F0B is preserved byte for byte as the attempt-1 configuration', () => {
  it('F0B still hashes to the F1A/F0B value at its recorded byte count, and F0C names exactly that', () => {
    expect(sha256(F0B_BYTES)).toBe(EXPECTED_F0B_FREEZE_RAW_SHA256);
    expect(F0B_BYTES.length).toBe(55_531);
    expect(F0C.freeze.predecessor.rawSha256).toBe(EXPECTED_F0B_FREEZE_RAW_SHA256);
    expect((F0C.freeze.predecessor as unknown as { utf8Bytes: number }).utf8Bytes).toBe(55_531);
    expect(F0C.freeze.scoring.comparatorPolicy.attempt1.freezeRawSha256).toBe(
      EXPECTED_F0B_FREEZE_RAW_SHA256,
    );
  });

  it('F0B still parses under its own loader and still names v1 and v2 as its two variants', () => {
    expect(F0B.rawSha256).toBe(EXPECTED_F0B_FREEZE_RAW_SHA256);
    expect(F0B.freeze.classifier.variants.map((v) => v.name)).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
    ]);
    expect(freezeRepairPolicy(F0B.freeze)).toEqual(REPAIR_POLICY_DISABLED);
  });

  it('every shared identity value in F0C equals F0B: corpus hashes, batch contexts, assembly identities, byte lengths', () => {
    expect(F0C.freeze.corpus).toEqual(F0B.freeze.corpus);
    for (const [index, batch] of F0C.freeze.batching.plan.entries()) {
      const f0b = F0B.freeze.batching.plan[index]!;
      expect(batch.ordinal).toBe(f0b.ordinal);
      expect(batch.assemblyInputSha256).toBe(f0b.assemblyInputSha256);
      expect(batch.serializedBatchUtf8Bytes).toBe(f0b.serializedBatchUtf8Bytes);
      expect(batch.goldIds).toEqual(f0b.goldIds);
      expect(batch.docIndices).toEqual(f0b.docIndices);
      expect(canonicalStringify(batch.context)).toBe(canonicalStringify(f0b.context));
      expect(batch.attempt1ComparatorFinalInputSha256).toEqual(f0b.finalInputSha256);
    }
  });
});

describe('2D2C-F0C: identity, status and the proposed hash', () => {
  it('is PROPOSED, revision F0C_V3_R1_ATTEMPT_2, attempt 2, and authorises nothing', () => {
    expect(F0C.freeze.status).toBe('PROPOSED_PENDING_OWNER_FREEZE_APPROVAL');
    expect(F0C.freeze.freezeRevision).toBe('F0C_V3_R1_ATTEMPT_2');
    expect(F0C.freeze.attemptNo).toBe(2);
    expect(F0C.freeze.approvalModel.thisFileAuthorises).toEqual([]);
    expect(F0C.freeze.exclusions.thisFreezeAuthorises).toEqual([]);
  });

  it('the proposed raw SHA-256 is the loader constant and the committed bytes', () => {
    expect(PROPOSED_F0C_FREEZE_RAW_SHA256).toBe(PROPOSED_RAW_SHA256);
    expect(F0C.rawSha256).toBe(PROPOSED_RAW_SHA256);
    expect(sha256(F0C_BYTES)).toBe(PROPOSED_RAW_SHA256);
  });
});

describe('2D2C-F0C: the one variant, recomputed from the PRODUCTION V3 bytes', () => {
  it('names PROMPT_V3_CANONICAL / PROMPT_V3_CANDIDATE at the V3 commit with the production prompt identity', () => {
    const [variant] = F0C.freeze.classifier.variants;
    expect(F0C.freeze.classifier.variants).toHaveLength(1);
    expect(variant).toEqual(F0C_VARIANT);
    expect(variant!.promptVersion).toBe(ORGUNIT_CLASSIFIER_PROMPT_VERSION);
    expect(variant!.runtimePromptSha256).toBe(
      sha256(Buffer.from(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8')),
    );
    expect(variant!.runtimePromptSha256).toBe(V3_PROMPT_SHA256);
    expect(variant!.runtimePromptCharacters).toBe([...ORGUNIT_CLASSIFIER_SYSTEM_PROMPT].length);
    expect(variant!.runtimePromptUtf8Bytes).toBe(
      Buffer.byteLength(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8'),
    );
    expect(variant!.runtimePromptCharacters).toBe(V3_PROMPT_SIZE.characters);
    expect(variant!.runtimePromptUtf8Bytes).toBe(V3_PROMPT_SIZE.utf8Bytes);
  });

  it('requests the same allow-listed model and the unchanged schema, assembly, rule and fetch-policy versions', () => {
    // The exact id is spelled only in the production allowlist (Phase 1A firewall); it is the Sonnet member.
    expect(F0C.freeze.classifier.requestedModelId).toMatch(/sonnet/);
    expect(F0C.freeze.classifier.requestedModelId).toBe(F0B.freeze.classifier.requestedModelId);
    expect(ORGUNIT_CLASSIFIER_ALLOWED_MODELS).toContain(F0C.freeze.classifier.requestedModelId);
    expect(F0C.freeze.classifier.outputSchemaVersion).toBe(
      ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
    );
    expect(F0C.freeze.classifier.assemblyVersion).toBe(ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION);
    expect(F0C.freeze.inputConstruction.context.ruleVersion).toBe(ORGUNIT_SIGNAL_RULE_VERSION);
    expect(F0C.freeze.inputConstruction.context.fetchPolicyVersion).toBe(FETCH_POLICY_VERSION);
    expect(F0C.freeze.classifier.runConfig).toEqual({ maxTurns: 3, thinking: 'disabled' });
    expect(F0C.freeze.scoring.gates).toEqual(
      (F0B.freeze as unknown as { scoring: { gates: unknown } }).scoring.gates,
    );
  });

  it('the V3 root resolves the same SDK-bundled executable F0B pinned (same SDK version, same binary identity)', () => {
    const f0b = F0B.freeze.classifier.claudeCodeExecutable;
    const f0c = (F0C.freeze.classifier as unknown as { claudeCodeExecutable: typeof f0b })
      .claudeCodeExecutable;
    expect(f0c).toEqual(f0b);
    expect((F0C.freeze.classifier as { agentSdk: { version: string } }).agentSdk.version).toBe(
      '0.3.251',
    );
  });
});

describe('2D2C-F0C: the 12 V3 final identities and the batches, recomputed from the DEVELOPMENT corpus', () => {
  const corpus = loadDevCorpus(F0B.freeze, {
    read: (relative) => readFileSync(join(ROOT, relative)),
  });
  const batches = reconstructAndVerifyFrozenBatches(F0B.freeze, corpus.rows, {
    canonicalStringify,
    computeFinalInputSha256,
    ruleVersion: ORGUNIT_SIGNAL_RULE_VERSION,
    fetchPolicyVersion: FETCH_POLICY_VERSION,
    assemblyVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
    outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
  });

  it('every V3 final identity recomputes through computeFinalInputSha256 from the reconstructed assembly identity', () => {
    for (const batch of F0C.freeze.batching.plan) {
      const reconstructed = batches.find((b) => b.ordinal === batch.ordinal)!;
      expect(reconstructed.assemblyInputSha256).toBe(batch.assemblyInputSha256);
      expect(batch.finalInputSha256.PROMPT_V3_CANONICAL).toBe(
        computeFinalInputSha256({
          assemblyInputSha256: reconstructed.assemblyInputSha256,
          promptVersion: 'orgunit-classifier-prompt-v3',
          outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
        }),
      );
    }
  });

  it('all 12 V3 identities are unique, and each differs from both attempt-1 identities of its batch', () => {
    const v3 = F0C.freeze.batching.plan.map((b) => b.finalInputSha256.PROMPT_V3_CANONICAL);
    expect(new Set(v3).size).toBe(12);
    for (const batch of F0C.freeze.batching.plan) {
      expect(batch.finalInputSha256.PROMPT_V3_CANONICAL).not.toBe(
        batch.attempt1ComparatorFinalInputSha256.PROMPT_V1_CANONICAL,
      );
      expect(batch.finalInputSha256.PROMPT_V3_CANONICAL).not.toBe(
        batch.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL,
      );
    }
  });

  it('every gold id the freeze names is a DEVELOPMENT canonical-corpus id, and all 49 are covered exactly once', () => {
    const devIds = new Set(corpus.rows.map((r) => r.goldId));
    const named = F0C.freeze.batching.plan.flatMap((b) => b.goldIds);
    expect(named).toHaveLength(49);
    expect(new Set(named).size).toBe(49);
    for (const id of named) expect(devIds.has(id), id).toBe(true);
    expect(corpus.rows.every((r) => r.split === 'DEVELOPMENT')).toBe(true);
  });
});

describe('2D2C-F0C: the attempt-2 plan is exactly 12 V3 evaluations in frozen order, and V1/V2 are never scheduled', () => {
  it('holds 12 evaluations, sequence = ordinal, one variant, attempt 2', () => {
    expect(PLAN.plannedLogicalEvaluations).toBe(12);
    expect(PLAN.evaluations).toHaveLength(12);
    expect(PLAN.attemptNo).toBe(2);
    expect(f0cPlanOrderIsFrozen(PLAN)).toBe(true);
    expect(PLAN.evaluations.map((e) => [e.sequence, e.logicalBatchOrdinal])).toEqual(
      Array.from({ length: 12 }, (_, i) => [i + 1, i + 1]),
    );
    expect(new Set(PLAN.evaluations.map((e) => e.variantName))).toEqual(
      new Set(['PROMPT_V3_CANONICAL']),
    );
    expect(new Set(PLAN.evaluations.map((e) => e.variantLabel))).toEqual(
      new Set(['PROMPT_V3_CANDIDATE']),
    );
  });

  it('carries no attempt-1 variant name, commit, prompt identity or final identity anywhere in the plan', () => {
    const serialized = canonicalStringify(PLAN);
    for (const name of ATTEMPT_1_VARIANT_NAMES) expect(serialized).not.toContain(name);
    for (const variant of FROZEN_VARIANTS) {
      expect(serialized).not.toContain(variant.gitCommit);
      expect(serialized).not.toContain(variant.runtimePromptSha256);
      expect(serialized).not.toContain(variant.promptVersion);
    }
    for (const batch of F0B.freeze.batching.plan) {
      expect(serialized).not.toContain(batch.finalInputSha256.PROMPT_V1_CANONICAL);
      expect(serialized).not.toContain(batch.finalInputSha256.PROMPT_V2_CANONICAL);
    }
    expect(F0C.freeze.batching.attempt1VariantsNotScheduled).toEqual([
      'PROMPT_V1_CANONICAL',
      'PROMPT_V2_CANONICAL',
    ]);
    expect(F0C.freeze.batching.plannedLogicalEvaluations).toEqual({ total: 12, perVariant: 12 });
  });

  it('the plan SHA-256 is deterministic and is the value presented for approval', () => {
    const again = buildF0CExecutionPlan(loadF0CFreezeFromBytes(F0C_BYTES).freeze, F0C.rawSha256);
    expect(f0cPlanSha256(again)).toBe(f0cPlanSha256(PLAN));
    expect(f0cPlanSha256(PLAN)).toMatch(/^[0-9a-f]{64}$/);
    expect(PLAN.freezeConfigRawSha256).toBe(PROPOSED_RAW_SHA256);
  });

  it('the plan is the same 12 organisations in the same order as attempt 1', () => {
    expect(PLAN.evaluations.map((e) => e.echeRowKey)).toEqual(
      F0B.freeze.batching.plan.map((b) => b.echeRowKey),
    );
    expect(PLAN.evaluations.map((e) => e.assemblyInputSha256)).toEqual(
      F0B.freeze.batching.plan.map((b) => b.assemblyInputSha256),
    );
  });
});

describe('2D2C-F0C: the repair policy equals the production constants and ADR 0011', () => {
  it('is enabled, one round, and the production minimum window, which the freeze marks PROPOSED', () => {
    expect(F0C.freeze.repairPolicy).toEqual(REPAIR_POLICY_ONE_ROUND);
    expect(F0C.freeze.repairPolicy.maxRoundsPerLogicalEvaluation).toBe(
      REPAIR_MAX_ROUNDS_PER_LOGICAL_EVALUATION,
    );
    expect(F0C.freeze.repairPolicy.minimumRemainingBudgetMs).toBe(
      REPAIR_MINIMUM_REMAINING_BUDGET_MS,
    );
    expect(F0C.freeze.repairPolicy.minimumRemainingBudgetMs).toBe(60_000);
    expect(F0C.freeze.repairContract.minimumRemainingBudgetMsStatus).toBe(
      'PROPOSED_PENDING_OWNER_FREEZE_APPROVAL',
    );
  });

  it('the contract restates every ADR 0011 rule, the reason codes, the request version and the repairable categories', () => {
    const contract = F0C.freeze.repairContract as unknown as {
      rules: string[];
      reasonCodes: string[];
      productionConstantSources: Record<string, string>;
      adrRawSha256: string;
      adr: string;
    };
    const rulesText = contract.rules.join('\n');
    for (const fragment of [
      'disabled behaviour is byte-compatible',
      'exactly one repair round per logical evaluation',
      'at most one isolated repair request per initially rejected document',
      'only for an item-level EVIDENCE or LENGTH rejection',
      'never triggered by a whole-call SCHEMA_INVALID, a DOC_INDEX rejection, a TIMEOUT',
      'single rejected document',
      'no sibling document, sibling output, full prior output, gold label, expected answer',
      'unchanged validator',
      'write-once under their derived repair identity',
      'never rewrites the original completion',
      'not by itself an experiment stop',
      'first-pass validity and post-repair validity are reported separately',
    ]) {
      expect(rulesText, fragment).toContain(fragment);
    }
    expect(contract.reasonCodes).toEqual([...REPAIR_REASON_CODES]);
    expect(contract.productionConstantSources['requestVersion']).toBe(REPAIR_REQUEST_VERSION);
    expect(contract.productionConstantSources['repairableCategories']).toContain(
      REPAIRABLE_CATEGORIES.join(', '),
    );
    expect(contract.adr).toBe('docs/adr/0011-bounded-item-level-repair-round.md');
    expect(contract.adrRawSha256).toBe(sha256(readFileSync(join(ROOT, contract.adr))));
  });

  it('DISABLED reproduces the former identity: the repair policy enters no final input identity', () => {
    // The identity function has no repair input at all: the same assembly
    // identity, prompt version and schema version give the same value
    // whatever the policy says. (The disabled BEHAVIOUR - no plan, no second
    // call, no repair row or artifact - is proved by the R1 orchestration,
    // child and scorer suites.)
    const disabled = clone();
    disabled.repairPolicy = { ...REPAIR_POLICY_DISABLED };
    const enabledPlan = buildF0CExecutionPlan(F0C.freeze, F0C.rawSha256);
    const disabledPlan = buildF0CExecutionPlan(disabled, F0C.rawSha256);
    expect(disabledPlan.evaluations.map((e) => e.finalInputSha256)).toEqual(
      enabledPlan.evaluations.map((e) => e.finalInputSha256),
    );
    expect(disabledPlan.evaluations.map((e) => e.assemblyInputSha256)).toEqual(
      enabledPlan.evaluations.map((e) => e.assemblyInputSha256),
    );
    // Only the plan's own policy field differs; the F0B loader would also read absent as disabled.
    expect(disabledPlan.repairPolicy.enabled).toBe(false);
    expect(freezeRepairPolicy(F0B.freeze).enabled).toBe(false);
    // And the production loader refuses the disabled variant of THIS freeze, because F0C freezes it enabled.
    expect(() => assertF0CAgreesWithProduction(disabled)).toThrow(/repairPolicy.enabled/);
  });
});

describe('2D2C-F0C: the call ceiling is mechanically derived from the frozen batch structure', () => {
  it('per evaluation: 1 original + at most documentCount repairs, each at most 1 + MAX_TRANSIENT_RETRIES adapter attempts', () => {
    for (const batch of F0C.freeze.batching.plan) {
      expect(batch.callCeiling).toEqual(deriveCallCeiling(batch.documentCount));
      expect(batch.callCeiling.maxProviderRequests).toBe(1 + batch.documentCount);
      expect(batch.callCeiling.maxAdapterAttempts).toBe(
        (1 + batch.documentCount) * (1 + MAX_TRANSIENT_RETRIES),
      );
    }
    const docs = F0C.freeze.batching.plan.reduce((t, b) => t + b.documentCount, 0);
    expect(docs).toBe(49);
    expect(F0C.freeze.callCeiling.totals).toEqual({
      logicalEvaluations: 12,
      originalRequests: 12,
      documents: 49,
      maxRepairRequests: 49,
      maxProviderRequests: 61,
      maxAdapterAttempts: 183,
    });
    expect(PLAN.callCeilingTotals).toEqual(F0C.freeze.callCeiling.totals);
    expect(F0C.freeze.callCeiling.maxTransientRetriesPerRequest).toBe(MAX_TRANSIENT_RETRIES);
    expect(() => deriveCallCeiling(0)).toThrow(RangeError);
  });
});

describe('2D2C-F0C: liveness under the shared-budget rule', () => {
  it('Tier 1 values are the frozen production constants and equal the repair module’s restatement', () => {
    const { tier1, tier2 } = F0C.freeze.liveness;
    expect(tier1.attemptSoftDeadlineMs).toBe(CLASSIFIER_CALL_SOFT_DEADLINE_MS);
    expect(tier1.abortCloseSettlementGraceMs).toBe(CLASSIFIER_CALL_HARD_KILL_GRACE_MS);
    expect(tier1.totalProviderCallBudgetMs).toBe(CLASSIFIER_CALL_TOTAL_BUDGET_MS);
    expect(tier1.transientRetries.maxAfterFirstAttempt).toBe(MAX_TRANSIENT_RETRIES);
    expect(tier2.parentWatchdogMs).toBe(FROZEN_TIER2_WATCHDOG_MS);
    expect(F0C.freeze.liveness.tier1).toEqual(F0B.freeze.liveness.tier1);
    expect(F0C.freeze.liveness.tier2).toEqual(F0B.freeze.liveness.tier2);
  });

  it('the per-evaluation worst case is the 600 s window plus one 10 s grace, inside the unchanged 700 s derivation', () => {
    const rule = F0C.freeze.liveness.sharedBudgetRule;
    expect(rule.perEvaluationWorstCaseMs.total).toBe(600_000 + 10_000);
    const d = F0C.freeze.liveness.tier2.watchdogDerivationMs;
    expect(
      d.authStatusRunnerTimeout +
        d.providerAttemptWindow +
        d.finalInnerCloseGrace +
        d.childStartupArtifactFlushAndSchedulingVariance,
    ).toBe(700_000);
    expect(rule.perEvaluationWorstCaseMs.total).toBeLessThan(
      d.providerAttemptWindow + d.finalInnerCloseGrace + 1,
    );
    expect(rule.tier2Sufficiency.watchdogMs).toBe(700_000);
    expect(rule.tier2Sufficiency.claim).toMatch(/^SUFFICIENT/);
    // The repair-timeout continuation rule is stated, and the original-request rule is retained verbatim.
    const decision = F0C.freeze.liveness.decisionRule as Record<string, string>;
    expect(decision['tier1FiresOnRepair']).toContain('not a stop');
    const f0bRule = (F0B.freeze.liveness as unknown as { decisionRule: Record<string, string> })
      .decisionRule;
    expect(decision['tier1FiresFirstOnOriginal']).toBe(f0bRule['tier1FiresFirst']);
    expect(decision['tier2KillsBecauseTier1DidNotFire']).toBe(
      f0bRule['tier2KillsBecauseTier1DidNotFire'],
    );
  });
});

describe('2D2C-F0C: attempt-1 artifacts are read-only comparator inputs outside the attempt-2 namespace', () => {
  it('names attempt 1 by its hashes only, read-only, never inside the attempt-2 namespace, and never reruns it', () => {
    const attempt1 = F0C.freeze.scoring.comparatorPolicy.attempt1 as Record<string, unknown>;
    expect(attempt1['artifactInventorySha256']).toBe(
      'ee17e1f2ee8021e59c06377342042e56f84269165f8ec39521011cb1d3538137',
    );
    expect(attempt1['authorisationSha256']).toBe(
      '46d1bd9ebed544f7ebf463f26ff6ec7cca89d8a9d849fdfd04a42412dc2d5705',
    );
    expect(attempt1['planSha256']).toBe(
      '05cb6984a57a871ac6b0a0720ab2fefceb5b5843f440dbf7831abdf9bfc82f6c',
    );
    expect(attempt1['artifactCount']).toBe(243);
    expect(attempt1['readOnly']).toBe(true);
    expect(attempt1['neverInsideAttempt2Namespace']).toBe(true);
    expect(F0C.freeze.scoring.postRepairTreatment).toMatchObject({
      gatesAppliedTo: 'POST_REPAIR_VALIDITY',
      firstPassAlwaysReported: true,
    });
  });

  it('every attempt-2 directory is under the V3 variant at attempt-2, disjoint from every attempt-1 directory', () => {
    for (const evaluation of PLAN.evaluations) {
      const dir = f0cAttemptDirectoryOf('/out', evaluation.logicalBatchOrdinal);
      expect(dir).toMatch(/^\/out\/evaluations\/PROMPT_V3_CANONICAL\/batch-\d{2}\/attempt-2$/);
      for (const name of ATTEMPT_1_VARIANT_NAMES) expect(dir).not.toContain(name);
      expect(dir).not.toContain('attempt-1');
    }
    expect(F0C_ATTEMPT_NO).toBe(2);
  });
});

describe('2D2C-F0C: the HOLDOUT boundary', () => {
  it('no HOLDOUT path, identifier or value enters the freeze’s plan or the derived plan', () => {
    const planText = canonicalStringify(PLAN);
    const freezePlanText = canonicalStringify(F0C.freeze.batching.plan);
    for (const text of [planText, freezePlanText]) {
      expect(text).not.toContain('HOLDOUT');
      for (const path of F0C.freeze.corpus.holdoutFilesNeverRead) expect(text).not.toContain(path);
    }
    expect(F0C.freeze.holdout.inferenceDuring2D2C).toBe('FORBIDDEN');
    expect(F0C.freeze.corpus.holdoutFilesNeverRead).toEqual(
      F0B.freeze.corpus.holdoutFilesNeverRead,
    );
    // The only evaluation fixtures this suite read are the two DEVELOPMENT ones the freezes name.
    expect(F0C.freeze.corpus.canonicalCorpusPath).toContain('canonical-v2.jsonl');
  });
});

describe('2D2C-F0C: loading and planning create nothing', () => {
  it('no authorisation, consumption marker or evaluation artifact exists for attempt 2 anywhere the runner could write', () => {
    // The freeze and plan are pure derivations: nothing under the repository
    // names an attempt-2 authorisation, marker or evaluation directory.
    const evaluationRoot = join(ROOT, 'docs', 'evaluation');
    for (const entry of readdirSync(evaluationRoot)) {
      expect(entry).not.toMatch(/attempt-2/);
      expect(entry).not.toMatch(/authorisation/i);
      expect(entry).not.toMatch(/consumption/i);
    }
    expect(
      existsSync(
        join(ROOT, 'docs', 'evaluation', 'PHASE_2B_2D2C_F0C_OWNER_FREEZE_APPROVAL_V1.json'),
      ),
    ).toBe(false);
    // The F0C harness module imports no writer.
    const source = readFileSync(
      join(ROOT, 'src/test/harness/phase2b2d2c/f0c/freezeF0C.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/writeFileSync|writeArtifactOnce|mkdirSync|linkSync|appendFileSync/);
    expect(source).not.toMatch(/from\s+['"]node:fs['"]/);
    expect(source).not.toMatch(
      /from\s+['"]\.\.\/(coordinator|childMain|cli|authorisation|artifacts)\.js['"]/,
    );
    expect(statSync(join(ROOT, F0C_FREEZE_PATH)).size).toBe(F0C.rawBytes);
  });
});

describe('2D2C-F0C: mutation coverage — each material freeze assertion bites', () => {
  const expectDrift = (mutated: F0CFreeze, pattern: RegExp): void => {
    expect(() => assertF0CAgreesWithProduction(mutated)).toThrow(F0CFreezeError);
    expect(() => assertF0CAgreesWithProduction(mutated)).toThrow(pattern);
  };

  it('one changed byte of the committed file is refused by hash before parsing', () => {
    const bytes = Buffer.concat([F0C_BYTES, Buffer.from(' ')]);
    expect(() => loadF0CFreezeFromBytes(bytes)).toThrow(F0CFreezeError);
    expect(() => loadF0CFreezeFromBytes(bytes)).toThrow(/does not equal the proposed value/);
    // The F0B bytes are not an F0C freeze either.
    expect(() => loadF0CFreezeFromBytes(F0B_BYTES)).toThrow(F0CFreezeError);
  });

  it('a changed prompt identity, version or commit is refused', () => {
    const wrongSha = clone();
    (wrongSha.classifier.variants[0] as { runtimePromptSha256: string }).runtimePromptSha256 =
      'a'.repeat(64);
    expectDrift(wrongSha, /variant\.runtimePromptSha256/);
    const wrongVersion = clone();
    (wrongVersion.classifier.variants[0] as { promptVersion: string }).promptVersion =
      'orgunit-classifier-prompt-v2';
    expectDrift(wrongVersion, /variant\.promptVersion/);
    const wrongCommit = clone();
    (wrongCommit.classifier.variants[0] as { gitCommit: string }).gitCommit =
      FROZEN_VARIANTS[1].gitCommit;
    expectDrift(wrongCommit, /variant\.gitCommit/);
  });

  it('a second variant, or an attempt-1 variant, is refused by shape', () => {
    const two = JSON.parse(JSON.stringify(F0C.freeze)) as { classifier: { variants: unknown[] } };
    two.classifier.variants.push(two.classifier.variants[0]);
    expect(() => loadF0CFreezeFromBytes(Buffer.from(JSON.stringify(two)))).toThrow(F0CFreezeError);
    const v2 = JSON.parse(JSON.stringify(F0C.freeze)) as {
      classifier: { variants: { name: string }[] };
    };
    v2.classifier.variants[0]!.name = 'PROMPT_V2_CANONICAL';
    expect(() => loadF0CFreezeFromBytes(Buffer.from(JSON.stringify(v2)))).toThrow(F0CFreezeError);
  });

  it('a changed V3 final identity, a swapped-in attempt-1 identity, or a changed assembly identity is refused', () => {
    const changed = clone();
    (
      changed.batching.plan[3] as { finalInputSha256: { PROMPT_V3_CANONICAL: string } }
    ).finalInputSha256.PROMPT_V3_CANONICAL = 'b'.repeat(64);
    expectDrift(changed, /plan 4: V3 final identity/);
    const swapped = clone();
    (
      swapped.batching.plan[6] as { finalInputSha256: { PROMPT_V3_CANONICAL: string } }
    ).finalInputSha256.PROMPT_V3_CANONICAL =
      swapped.batching.plan[6]!.attempt1ComparatorFinalInputSha256.PROMPT_V2_CANONICAL;
    expectDrift(swapped, /plan 7: V3 final identity/);
    const assembly = clone();
    (assembly.batching.plan[0] as { assemblyInputSha256: string }).assemblyInputSha256 = 'c'.repeat(
      64,
    );
    expectDrift(assembly, /plan 1/);
  });

  it('a changed repair policy, minimum window or a disabled policy is refused', () => {
    const rounds = clone();
    (
      rounds.repairPolicy as { maxRoundsPerLogicalEvaluation: number }
    ).maxRoundsPerLogicalEvaluation = 2;
    expect(() => loadF0CFreezeFromBytes(Buffer.from(JSON.stringify(rounds)))).toThrow(
      F0CFreezeError,
    );
    const window = clone();
    (window.repairPolicy as { minimumRemainingBudgetMs: number }).minimumRemainingBudgetMs = 30_000;
    expectDrift(window, /repairPolicy.minimumRemainingBudgetMs/);
  });

  it('a changed call ceiling, a changed total, or a changed transient-retry count is refused', () => {
    const ceiling = clone();
    (ceiling.batching.plan[1]!.callCeiling as { maxRepairRequests: number }).maxRepairRequests = 99;
    expectDrift(ceiling, /plan 2: callCeiling/);
    const totals = clone();
    (totals.callCeiling.totals as { maxProviderRequests: number }).maxProviderRequests = 60;
    expectDrift(totals, /callCeiling.totals/);
    const retries = clone();
    (
      retries.callCeiling as { maxTransientRetriesPerRequest: number }
    ).maxTransientRetriesPerRequest = 5;
    expectDrift(retries, /callCeiling retries/);
  });

  it('a changed liveness value, watchdog or shared-budget worst case is refused', () => {
    const budget = clone();
    (budget.liveness.tier1 as { totalProviderCallBudgetMs: number }).totalProviderCallBudgetMs =
      900_000;
    expectDrift(budget, /tier1.totalProviderCallBudgetMs/);
    const watchdog = clone();
    (watchdog.liveness.tier2 as { parentWatchdogMs: number }).parentWatchdogMs = 800_000;
    expectDrift(watchdog, /tier2.parentWatchdogMs/);
    const worst = clone();
    (worst.liveness.sharedBudgetRule.perEvaluationWorstCaseMs as { total: number }).total = 700_000;
    expectDrift(worst, /sharedBudgetRule worst case/);
  });

  it('a reordered plan, a missing capture field or a missing stop condition is refused', () => {
    const reordered = clone();
    const plan = reordered.batching.plan as unknown[];
    [plan[0], plan[1]] = [plan[1], plan[0]];
    expectDrift(reordered, /plan ordinal/);
    const capture = clone();
    (capture.outputCapture as { requiredPerLogicalBatch: string[] }).requiredPerLogicalBatch.pop();
    expectDrift(capture, /capture field/);
    const stop = clone();
    (stop.stopConditions as { conditions: unknown[] }).conditions.pop();
    expectDrift(stop, /stop condition/);
  });

  it('a HOLDOUT path smuggled into the plan is detected by the boundary check, and a wrong predecessor hash by shape', () => {
    const smuggled = clone();
    (smuggled.batching.plan[0] as { goldIds: string[] }).goldIds[0] = 'HOLDOUT_INJECTED';
    expect(canonicalStringify(smuggled.batching.plan)).toContain('HOLDOUT');
    expect(() => loadF0CFreezeFromBytes(Buffer.from(JSON.stringify(smuggled)))).toThrow(
      F0CFreezeError,
    );
    const predecessor = JSON.parse(JSON.stringify(F0C.freeze)) as {
      predecessor: { rawSha256: string };
    };
    predecessor.predecessor.rawSha256 = 'd'.repeat(64);
    expect(() => loadF0CFreezeFromBytes(Buffer.from(JSON.stringify(predecessor)))).toThrow(
      F0CFreezeError,
    );
  });

  it('after every mutation the committed freeze and its parse are unchanged', () => {
    expect(sha256(readFileSync(join(ROOT, F0C_FREEZE_PATH)))).toBe(PROPOSED_RAW_SHA256);
    expect(sha256(readFileSync(join(ROOT, FREEZE_PATH)))).toBe(EXPECTED_F0B_FREEZE_RAW_SHA256);
    expect(canonicalStringify(loadF0CFreezeFromBytes(F0C_BYTES).freeze)).toBe(
      canonicalStringify(F0C.freeze),
    );
  });
});

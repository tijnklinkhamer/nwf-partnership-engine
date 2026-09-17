/**
 * PHASE 2B-2D2C-F6 (part C) — THE FRESH FINAL-V6 N=5 RESTART FREEZE, VERIFIED.
 *
 * Every identity is RE-DERIVED from the committed, owner-approved F2 study
 * and this build's live prompt, then compared with the F6 freeze candidate.
 * The suite proves F6 is a NEW study (new id, slots and roots), that it runs
 * the IDENTICAL twelve frozen V6 evaluations under the identical contract,
 * that no F5 identity can authorise it, and that the host-awake contract is
 * recorded without touching classifier or reliability semantics.
 *
 * ZERO PROVIDER. No inference, no auth-status, no DEV execution, no scoring,
 * no gold, no HOLDOUT. Creates no directory.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '../../orgunits/classify/canonical.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import {
  EXPECTED_CORPUS_ITEM_COUNT,
  EXPECTED_LOGICAL_BATCHES_PER_VARIANT,
  MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
  RELIABILITY_SEMANTICS_V2,
} from '../harness/phase2b2d2c/constants.js';
import {
  buildF0OExecutionPlan,
  f0oPlanSha256,
  F0O_FREEZE_PATH,
  loadF0OFreezeFromBytes,
} from '../harness/phase2b2d2c/f0o/freezeF0O.js';
import {
  F2_CONTROL_ROOT,
  F2_FREEZE_PATH,
  F2_INTEGRATED_RUNTIME_COMMIT,
  F2_STUDY_ROOT,
  loadF2FreezeFromBytes,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_SHA256,
} from '../harness/phase2b2d2c/f2/freezeF2.js';
import {
  buildF2StudyPlan,
  f2StudyPlanSha256,
  F2_SLOTS,
  type F2PromptIdentity,
} from '../harness/phase2b2d2c/f2/studyPlanCoreF2.js';
import { F4_STUDY_ID } from '../harness/phase2b2d2c/f4/v6StudyContextF4.js';
import {
  F5_CONSUMED_CANDIDATE_SHA256S,
  F5_STUDY_EXECUTION_APPROVAL_SHA256,
} from '../harness/phase2b2d2c/f6/f5ClosureF6.js';
import {
  assertF6FreezeAgreesWithProduction,
  assertF6FreezeMatchesApprovedF2,
  F6FreezeError,
  F6FreezeSchema,
  F6_APPROVAL_RECORD_PATH,
  F6_APPROVAL_RECORD_RAW_BYTES,
  F6_APPROVAL_RECORD_RAW_SHA256,
  F6_FREEZE_PATH,
  F6_OWNER_DECISION_MARKER,
  loadF6FreezeFromBytes,
  PROPOSED_F6_FREEZE_RAW_BYTES,
  PROPOSED_F6_FREEZE_RAW_SHA256,
  PROPOSED_F6_PLAN_SHA256,
  type F6Freeze,
} from '../harness/phase2b2d2c/f6/freezeF6.js';
import {
  evaluateHostAwakePreflight,
  F6_CAFFEINATE_WRAPPER,
  LID_OPEN_REQUIRED,
  parseCaffeinateAssertions,
  parseLidObservation,
  parsePowerSource,
  type HostAwakeObservations,
} from '../harness/phase2b2d2c/f6/hostAwakePreflightF6.js';
import { priorStudyIdentityProblems } from '../harness/phase2b2d2c/f6/priorStudyIdentityF6.js';
import {
  buildF6StudyPlan,
  f6OutputRootPathOf,
  f6StudyPlanSha256,
  F6StudyPlanError,
  F6_CONTROL_ROOT,
  F6_SLOTS,
  F6_STUDY_ID,
  F6_STUDY_ROOT,
  resolveF6Slot,
} from '../harness/phase2b2d2c/f6/studyPlanCoreF6.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const F6_BYTES = readFileSync(join(ROOT, F6_FREEZE_PATH));
const F6 = loadF6FreezeFromBytes(F6_BYTES);
const F2 = loadF2FreezeFromBytes(readFileSync(join(ROOT, F2_FREEZE_PATH)));
const F0O = loadF0OFreezeFromBytes(readFileSync(join(ROOT, F0O_FREEZE_PATH)));
const F0O_PLAN = buildF0OExecutionPlan(F0O.freeze, F0O.rawSha256);

/** The LIVE prompt identity of this build, recomputed — never read from a freeze. */
const PROMPT: F2PromptIdentity = {
  promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  promptSha256: sha256(Buffer.from(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8')),
  runtimeCommit: F2_INTEGRATED_RUNTIME_COMMIT,
  outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
};
const F2_PLAN = buildF2StudyPlan(F0O_PLAN, f0oPlanSha256(F0O_PLAN), PROMPT);
const F6_PLAN = buildF6StudyPlan(F2_PLAN, F0O_PLAN, f0oPlanSha256(F0O_PLAN), PROMPT);

describe('2D2C-F6 freeze: identity, status and what it authorises', () => {
  it('is exactly the pinned bytes, PROPOSED, and authorises nothing', () => {
    expect(F6.rawSha256).toBe(PROPOSED_F6_FREEZE_RAW_SHA256);
    expect(F6.rawBytes).toBe(PROPOSED_F6_FREEZE_RAW_BYTES);
    expect(F6.freeze.status).toBe('PROPOSED_PENDING_OWNER_FREEZE_APPROVAL');
    expect(F6.freeze.studyId).toBe('FINAL_V6_DEV_N5_RESTART_1');
    expect(F6.freeze.freezeRevision).toBe('F6_FINAL_V6_N5_FRESH_RESTART_AFTER_HOST_SLEEP');
    expect(F6.freeze.approvalModel.thisFileAuthorises).toEqual([]);
    expect(F6.freeze.exclusions.thisFreezeAuthorises).toEqual([]);
    expect(F6.freeze.approvalModel.ownerFreezeApprovalExists).toBe(false);
    expect(F6.freeze.approvalModel.executionAuthorisationExists).toBe(false);
  });

  it('refuses drifted bytes before parsing them', () => {
    const drifted = Buffer.from(F6_BYTES.toString('utf8').replace('"V6_RESTART_5"', '"V6_REP_5"'));
    expect(() => loadF6FreezeFromBytes(drifted)).toThrow(F6FreezeError);
  });

  it('the owner FREEZE-ONLY approval exists, names exactly these bytes and authorises nothing; no F6 root and no F6 candidate exists', () => {
    const bytes = readFileSync(join(ROOT, F6_APPROVAL_RECORD_PATH));
    expect(sha256(bytes)).toBe(F6_APPROVAL_RECORD_RAW_SHA256);
    expect(bytes.length).toBe(F6_APPROVAL_RECORD_RAW_BYTES);
    const approval = JSON.parse(bytes.toString('utf8')) as {
      ownerDecisionMarker: string;
      approvalIsFreezeOnly: boolean;
      approvedFreeze: { file: string; rawSha256: string; rawBytes: number };
      freezeApproved: boolean;
      executionAuthorised: boolean;
      providerCallsAuthorised: boolean;
      scoringAuthorised: boolean;
      holdoutAuthorised: boolean;
      thisRecordAuthorises: unknown[];
    };
    expect(approval.ownerDecisionMarker).toBe(F6_OWNER_DECISION_MARKER);
    expect(approval.approvalIsFreezeOnly).toBe(true);
    expect(approval.approvedFreeze).toMatchObject({
      file: F6_FREEZE_PATH,
      rawSha256: PROPOSED_F6_FREEZE_RAW_SHA256,
      rawBytes: PROPOSED_F6_FREEZE_RAW_BYTES,
    });
    expect(approval.freezeApproved).toBe(true);
    expect(approval.executionAuthorised).toBe(false);
    expect(approval.providerCallsAuthorised).toBe(false);
    expect(approval.scoringAuthorised).toBe(false);
    expect(approval.holdoutAuthorised).toBe(false);
    expect(approval.thisRecordAuthorises).toEqual([]);
    // The freeze bytes did not change on approval.
    expect(F6.rawSha256).toBe(PROPOSED_F6_FREEZE_RAW_SHA256);

    expect(existsSync(F6_STUDY_ROOT)).toBe(false);
    for (const slot of F6_SLOTS) expect(existsSync(f6OutputRootPathOf(slot))).toBe(false);
    for (const entry of readdirSync(join(ROOT, 'docs/evaluation'))) {
      expect(entry).not.toMatch(/F6_EXECUTION|F6_STUDY_EXECUTION/);
    }
  });

  it('is the approved F2 contract field for field — only identity, slots, roots and host-awake are new', () => {
    expect(() =>
      assertF6FreezeMatchesApprovedF2(F6.freeze, F2.freeze, F6_PLAN, f6StudyPlanSha256(F6_PLAN)),
    ).not.toThrow();
    const tuned = clone(F6.freeze);
    tuned.perRunPolicy.repairPolicy.minimumRemainingBudgetMs = 60_000 as 120_000;
    expect(() =>
      assertF6FreezeMatchesApprovedF2(tuned, F2.freeze, F6_PLAN, f6StudyPlanSha256(F6_PLAN)),
    ).toThrow(F6FreezeError);
  });
});

describe('2D2C-F6: a NEW study — F5 is not counted, pooled, imported or replaced', () => {
  it('has exactly five slots, V6_RESTART_1..5, in frozen order, all fresh', () => {
    expect(F6_SLOTS).toHaveLength(5);
    expect(F6.freeze.slots.map((slot) => slot.slotId)).toEqual([
      'V6_RESTART_1',
      'V6_RESTART_2',
      'V6_RESTART_3',
      'V6_RESTART_4',
      'V6_RESTART_5',
    ]);
    expect(canonicalStringify(F6.freeze.slots)).toBe(canonicalStringify(F6_SLOTS));
    const f5Ids = new Set(F2_SLOTS.map((slot) => slot.slotId));
    const f5Roots = new Set(F2_SLOTS.map((slot) => slot.futureOutputRootName));
    for (const slot of F6_SLOTS) {
      expect(f5Ids.has(slot.slotId)).toBe(false);
      expect(f5Roots.has(slot.futureOutputRootName)).toBe(false);
    }
  });

  it('F5 slots cannot validate as F6 slots, in the resolver or in the freeze', () => {
    for (const slot of F2_SLOTS) {
      expect(() => resolveF6Slot(slot.slotId)).toThrow(F6StudyPlanError);
    }
    const withF5Slot = clone(F6.freeze) as unknown as { slots: Array<{ slotId: string }> };
    withF5Slot.slots[4]!.slotId = 'V6_REP_5';
    expect(F6FreezeSchema.safeParse(withF5Slot).success).toBe(false);
  });

  it('the F6 roots are neither the F5 roots nor nested in them, and both F5 roots are must-not-reuse', () => {
    expect(F6_STUDY_ROOT).not.toBe(F2_STUDY_ROOT);
    expect(F6_CONTROL_ROOT).not.toBe(F2_CONTROL_ROOT);
    expect(F6_STUDY_ROOT.startsWith(`${F2_STUDY_ROOT}/`)).toBe(false);
    expect(F6_CONTROL_ROOT.startsWith(`${F2_CONTROL_ROOT}/`)).toBe(false);
    expect(F6.freeze.outputRoots.mustNotReuse).toEqual(
      expect.arrayContaining([F2_STUDY_ROOT, F2_CONTROL_ROOT]),
    );

    for (const [field, value] of [
      ['studyRoot', F2_STUDY_ROOT],
      ['studyRoot', `${F2_STUDY_ROOT}/v6-restart`],
      ['controlRoot', F2_CONTROL_ROOT],
    ] as const) {
      const reused = clone(F6.freeze) as unknown as { outputRoots: Record<string, string> };
      reused.outputRoots[field] = value;
      // The schema pins the exact root; the production check refuses the collision on its own too.
      expect(F6FreezeSchema.safeParse(reused).success).toBe(false);
      expect(() => assertF6FreezeAgreesWithProduction(reused as unknown as F6Freeze)).toThrow(
        F6FreezeError,
      );
    }
  });

  it('binds F5 only as immutable evidence: not counted toward N, never pooled, nothing imported or replaced', () => {
    const binding = F6.freeze.f5Binding;
    expect(binding.f5CountedTowardF6N).toBe(false);
    expect(binding.f5PooledWithF6).toBe(false);
    expect(binding.f5SlotsImportedIntoF6).toEqual([]);
    expect(binding.f5SlotsReplacedByF6).toEqual([]);
    expect(binding.f5SemanticObservationsCountedInF6).toBe(0);
    expect(binding.f5Immutable).toBe(true);
    expect(F6.freeze.studyDesign.historicalRunsCountTowardN).toBe(false);
    expect(F6.freeze.finalDevDecisionRule.noPoolingWithF5).toBe(true);
  });

  it('the restart is justified structurally only, never by semantics', () => {
    expect(F6.freeze.restartReason.notBasedOn).toEqual(
      expect.arrayContaining([
        'SEMANTIC_VERDICTS',
        'CORRECTNESS',
        'PRECISION',
        'RECALL',
        'GATE_OUTCOMES',
        'GOLD',
        'MODEL_COMPARISON',
      ]),
    );
    expect(F6.freeze.restartReason.f5SemanticResultsInspected).toBe(false);
    expect(F6.freeze.restartReason.isNotRerunningUntilV6Passes).toBe(true);
    const text = F6_BYTES.toString('utf8');
    expect(text).not.toContain('V6_FAILED');
    expect(text).not.toContain('DEV_NOT_READY_FOR_HOLDOUT_BECAUSE_OF_MODEL_PERFORMANCE');
  });
});

describe('2D2C-F6: old F5 authorities cannot authorise F6', () => {
  /** An F3/F4-shaped per-slot candidate exactly as F5 consumed it (fields that matter). */
  const f5Candidate = {
    authorisationVersion: 'phase2b-2d2c-f3-v6-slot-authorisation-v1',
    studyId: F4_STUDY_ID,
    slotId: 'V6_REP_1',
    outputRoot: `${F2_STUDY_ROOT}/v6-rep-1`,
    promptSha256: V6_PROMPT_SHA256,
  };

  it('refuses an F5 slot candidate, study approval and outer slot identity by what they name', () => {
    expect(priorStudyIdentityProblems(f5Candidate).length).toBeGreaterThanOrEqual(3);
    expect(
      priorStudyIdentityProblems({
        studyId: F4_STUDY_ID,
        candidateSet: F5_CONSUMED_CANDIDATE_SHA256S.map((sha, i) => ({
          slotId: `V6_REP_${i + 1}`,
          candidateAuthorisationSha256: sha,
        })),
      }).length,
    ).toBeGreaterThanOrEqual(11);
    expect(
      priorStudyIdentityProblems({
        studyId: F6_STUDY_ID,
        supersedes: F5_STUDY_EXECUTION_APPROVAL_SHA256,
      }),
    ).toHaveLength(1);
  });

  it('an F5 authority relabelled with the F6 study id is STILL refused for its F5 slot and root', () => {
    const relabelled = { ...f5Candidate, studyId: F6_STUDY_ID };
    const problems = priorStudyIdentityProblems(relabelled);
    expect(problems.some((p) => p.includes('V6_REP_1'))).toBe(true);
    expect(problems.some((p) => p.includes('F5 root'))).toBe(true);
  });

  it('a clean F6-shaped document names no F5 identity (which grants nothing by itself)', () => {
    const f6Shaped = {
      studyId: F6_STUDY_ID,
      slotId: 'V6_RESTART_1',
      outputRoot: f6OutputRootPathOf(F6_SLOTS[0]!),
      promptSha256: V6_PROMPT_SHA256,
    };
    // The F6 root shares a name PREFIX with the F5 root and must not be mistaken for it.
    expect(F6_STUDY_ROOT.startsWith(F2_STUDY_ROOT)).toBe(true);
    expect(priorStudyIdentityProblems(f6Shaped)).toEqual([]);
  });

  it.skipIf(!existsSync(join(F2_CONTROL_ROOT, 'execution-candidates-f4')))(
    'every REAL consumed F4 candidate and the REAL F5 study approval are refused',
    () => {
      const dir = join(F2_CONTROL_ROOT, 'execution-candidates-f4');
      const files = readdirSync(dir).filter((name) => name.endsWith('.json'));
      expect(files).toHaveLength(5);
      for (const name of [
        ...files.map((f) => join(dir, f)),
        join(F2_CONTROL_ROOT, 'STUDY_EXECUTION_APPROVAL.json'),
      ]) {
        const document: unknown = JSON.parse(readFileSync(name, 'utf8'));
        expect(priorStudyIdentityProblems(document).length, name).toBeGreaterThan(0);
      }
    },
  );
});

describe('2D2C-F6: the plan is exactly the approved F2 twelve-evaluation V6 plan', () => {
  it('the source plan is the owner-approved F2 plan, and F6 derives to the frozen hash', () => {
    expect(f2StudyPlanSha256(F2_PLAN)).toBe(PROPOSED_F2_PLAN_SHA256);
    expect(F6_PLAN.sourceF2PlanSha256).toBe(PROPOSED_F2_PLAN_SHA256);
    expect(f6StudyPlanSha256(F6_PLAN)).toBe(PROPOSED_F6_PLAN_SHA256);
    expect(F6.freeze.derivedStudyPlanSha256).toBe(PROPOSED_F6_PLAN_SHA256);
    const again = buildF6StudyPlan(F2_PLAN, F0O_PLAN, f0oPlanSha256(F0O_PLAN), PROMPT);
    expect(f6StudyPlanSha256(again)).toBe(PROPOSED_F6_PLAN_SHA256);
  });

  it('every F6 replicate is 12 evaluations, ordinals 1..12, 49 documents, identical to F2 except the slot id', () => {
    expect(F6_PLAN.plan.evaluations).toHaveLength(60);
    F6_PLAN.plan.evaluations.forEach((evaluation, index) => {
      const source = F2_PLAN.evaluations[index]!;
      expect({ ...evaluation, slotId: source.slotId }).toEqual(source);
      expect(evaluation.slotId).toBe(
        F6_SLOTS[Math.floor(index / EXPECTED_LOGICAL_BATCHES_PER_VARIANT)]!.slotId,
      );
    });
    for (const slot of F6_SLOTS) {
      const forSlot = F6_PLAN.plan.evaluations.filter((e) => e.slotId === slot.slotId);
      expect(forSlot.map((e) => e.logicalBatchOrdinal)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1),
      );
      expect(new Set(forSlot.flatMap((e) => e.orderedGoldIds)).size).toBe(
        EXPECTED_CORPUS_ITEM_COUNT,
      );
    }
  });

  it('the V6 prompt and every assembly/final identity are unchanged, and listed in the freeze exactly', () => {
    expect(PROMPT.promptSha256).toBe(V6_PROMPT_SHA256);
    expect(F6.freeze.lineages.semanticSource.promptSha256).toBe(PROMPT.promptSha256);
    expect(F6.freeze.lineages.promptChangedByThisFreeze).toBe(false);
    const listed = F6.freeze.batching.frozenLogicalEvaluations;
    F2_PLAN.evaluations.slice(0, 12).forEach((source, index) => {
      expect(listed[index]!.assemblyInputSha256).toBe(source.assemblyInputSha256);
      expect(listed[index]!.finalInputSha256V6).toBe(source.finalInputSha256);
      expect(listed[index]!.documentCount).toBe(source.orderedDocIndices.length);
    });
    expect(listed[0]!.assemblyInputSha256).toBe(F2.freeze.batching.firstBatchAssemblyInputSha256);
    expect(listed[0]!.finalInputSha256V6).toBe(F2.freeze.batching.firstBatchFinalInputSha256V6);
  });

  it('refuses a source plan that is not the approved F2 plan', () => {
    const otherPrompt = { ...PROMPT, runtimeCommit: 'f'.repeat(40) };
    const drifted = buildF2StudyPlan(F0O_PLAN, f0oPlanSha256(F0O_PLAN), otherPrompt);
    expect(() => buildF6StudyPlan(drifted, F0O_PLAN, f0oPlanSha256(F0O_PLAN), PROMPT)).toThrow(
      F6StudyPlanError,
    );
  });

  it('keeps the derived ceilings: 61/183 per run, 60/305/915 for the study', () => {
    expect(F6_PLAN.plan.ceilings).toMatchObject({
      perRunMaxProviderRequests: 61,
      perRunMaxAdapterAttempts: 183,
      fullStudyLogicalEvaluations: 60,
      fullStudyMaxProviderRequests: 305,
      fullStudyMaxAdapterAttempts: 915,
    });
    expect(F6_PLAN.plan.ceilings).toEqual(F2_PLAN.ceilings);
  });
});

describe('2D2C-F6: reliability, decision rule and the no-adaptive-inspection boundary', () => {
  it('the timeout ceiling stays 2: first and second continue, the third stops', () => {
    expect(MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE).toBe(2);
    expect(F6.freeze.reliability.maxNonTerminalTimeoutsPerReplicate).toBe(2);
    expect(F6.freeze.reliability.timeoutCeilingBehaviour).toEqual({
      firstConfirmedNonTerminalTimeout: 'MAY_CONTINUE',
      secondConfirmedNonTerminalTimeout: 'MAY_CONTINUE',
      thirdConfirmedNonTerminalTimeout: 'STOPS_FAIL_CLOSED',
    });
    const raised = clone(F6.freeze) as unknown as { reliability: Record<string, unknown> };
    raised.reliability.maxNonTerminalTimeoutsPerReplicate = 3;
    expect(F6FreezeSchema.safeParse(raised).success).toBe(false);
  });

  it('runs RELIABILITY_SEMANTICS_V2 with C2 NOT_IMPLEMENTED', () => {
    expect(F6.freeze.reliability.semanticsVersion).toBe(RELIABILITY_SEMANTICS_V2);
    expect(F6.freeze.reliability.c2Implemented).toBe(false);
    expect(F6.freeze.reliability.c2Status).toBe('NOT_IMPLEMENTED');
    expect(F6.freeze.exclusions.noC2).toBe(true);
  });

  it('DEV_READY_FOR_HOLDOUT requires 5/5 complete AND 5/5 individually passing — no fallback of any kind', () => {
    const rule = F6.freeze.finalDevDecisionRule;
    expect(rule.decision).toBe('DEV_READY_FOR_HOLDOUT');
    expect(rule.conditions).toHaveLength(2);
    expect(rule.conditions[0]).toContain('all 5/5 F6 replicates are COMPLETE');
    expect(rule.conditions[1]).toContain(
      'individually passes every one of the six frozen DEV gates',
    );
    expect(rule.noFourOfFiveFallback).toBe(true);
    expect(rule.noPoolingWithF5).toBe(true);
    expect(rule.noAveragingAwayAFailingReplicate).toBe(true);
    expect(rule.noReplacementOfAnF6ClassCReplicate).toBe(true);
    expect(rule.noThresholdTuning).toBe(true);
    expect(rule.noPromptTuning).toBe(true);
    expect(rule.f6CannotObtainFiveCompleteReplicates).toBe('NOT_HOLDOUT_READY');
    const weakened = clone(F6.freeze) as unknown as {
      finalDevDecisionRule: Record<string, unknown>;
    };
    weakened.finalDevDecisionRule.noFourOfFiveFallback = false;
    expect(F6FreezeSchema.safeParse(weakened).success).toBe(false);
    expect(F6.freeze.sixFrozenDevGates).toEqual({
      minSchemaValidSpanVerifiedRate: F2.freeze.sixFrozenDevGates.minSchemaValidSpanVerifiedRate,
      minUnitPageRecall: F2.freeze.sixFrozenDevGates.minUnitPageRecall,
      minUnitPagePrecision: F2.freeze.sixFrozenDevGates.minUnitPagePrecision,
      minUnitTypeAccuracy: F2.freeze.sixFrozenDevGates.minUnitTypeAccuracy,
      minHardNegativeRejection: F2.freeze.sixFrozenDevGates.minHardNegativeRejection,
      maxNeedsReviewRate: F2.freeze.sixFrozenDevGates.maxNeedsReviewRate,
    });
  });

  it('gold-blind, no scorer, no inspection or comparison between slots, HOLDOUT forbidden', () => {
    const boundary = F6.freeze.executionBoundary;
    expect(boundary.goldBlind).toBe(true);
    expect(boundary.noScorerReachableFromExecution).toBe(true);
    expect(boundary.noSemanticResultInspectionBetweenReplicates).toBe(true);
    expect(boundary.noGateScoringBetweenReplicates).toBe(true);
    expect(boundary.noComparisonToF5).toBe(true);
    expect(boundary.allFiveSlotsTerminalBeforeAnyScoringBegins).toBe(true);
    expect(F6.freeze.noAdaptiveScoring.noAdaptiveStoppingBecauseEarlyResultsLookGoodOrBad).toBe(
      true,
    );
    expect(F6.freeze.gold.loadedByF6Preparation).toBe(false);
    expect(F6.freeze.holdout.accessDuringThisStudy).toBe('FORBIDDEN');
    expect(F6.freeze.holdout.openedOrHashedByF6).toBe(false);
  });
});

describe('2D2C-F6: the host-awake execution contract', () => {
  /** Verbatim shapes captured on the run Mac on 2026-09-17 (pids and ids shortened only). */
  const ASSERTIONS = [
    'Assertion status system-wide:',
    '   PreventUserIdleSystemSleep     1',
    'Listed by owning process:',
    '   pid 81313(caffeinate): [0x0002331e00019294] 00:00:00 PreventUserIdleSystemSleep named: "caffeinate command-line tool"  ',
    "\tDetails: caffeinate asserting on behalf of '/bin/sh' (pid 81312)",
    '\tLocalized=THE CAFFEINATE TOOL IS PREVENTING SLEEP.',
    '   pid 81313(caffeinate): [0x0002331e00079296] 00:00:00 PreventSystemSleep named: "caffeinate command-line tool"  ',
    "\tDetails: caffeinate asserting on behalf of '/bin/sh' (pid 81312)",
    '   pid 80835(caffeinate): [0x000232f20001928f] 00:00:44 PreventUserIdleSystemSleep named: "caffeinate command-line tool"  ',
    '\tDetails: caffeinate asserting for 300 secs',
  ].join('\n');
  const BATTERY =
    "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1)\t99%; discharging; present: true";
  const LID_OPEN = '  |   "AppleClamshellCausesSleep" = No\n  |   "AppleClamshellState" = No\n';
  const base: HostAwakeObservations = {
    platform: 'darwin',
    observedAtUtc: '2026-09-17T12:00:00.000Z',
    processLineagePids: [81320, 81312, 81310],
    pmsetBattStdout: BATTERY,
    pmsetAssertionsStdout: ASSERTIONS,
    ioregClamshellStdout: LID_OPEN,
  };

  it('parses assertions on behalf of a pid, the power source and the lid state', () => {
    const parsed = parseCaffeinateAssertions(ASSERTIONS);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toEqual({
      assertingPid: 81313,
      assertionType: 'PreventUserIdleSystemSleep',
      onBehalfOfPid: 81312,
    });
    expect(parsed[2]!.onBehalfOfPid).toBeNull();
    expect(parsePowerSource(BATTERY)).toBe('BATTERY_POWER');
    expect(parsePowerSource("Now drawing from 'AC Power'")).toBe('AC_POWER');
    expect(parsePowerSource(null)).toBe('UNKNOWN');
    expect(parseLidObservation(LID_OPEN)).toBe('OPEN');
    expect(parseLidObservation('"AppleClamshellState" = Yes')).toBe('CLOSED');
    expect(parseLidObservation('"AppleClamshellState" = Yes\n"AppleClamshellState" = No')).toBe(
      'UNREADABLE',
    );
    expect(parseLidObservation('')).toBe('UNREADABLE');
  });

  it('passes under caffeinate covering an ancestor; battery is an advisory, never a refusal', () => {
    const record = evaluateHostAwakePreflight(base);
    expect(record.verdict).toBe('HOST_AWAKE_PREFLIGHT_PASSED');
    expect(record.coveredPid).toBe(81312);
    expect(record.refusals).toEqual([]);
    expect(record.advisories).toEqual(['NOT_ON_AC_POWER_PREVENT_SYSTEM_SLEEP_INEFFECTIVE']);
    expect(record.operatorPreconditions).toContain(LID_OPEN_REQUIRED);
  });

  it('refuses without a caffeinate assertion covering this process (an unrelated caffeinate does not count)', () => {
    const record = evaluateHostAwakePreflight({ ...base, processLineagePids: [90000, 1] });
    expect(record.verdict).toBe('HOST_AWAKE_PREFLIGHT_REFUSED');
    expect(record.refusals).toEqual(['NO_CAFFEINATE_IDLE_SLEEP_ASSERTION_FOR_THIS_PROCESS']);
  });

  it('refuses a closed lid and a non-darwin platform; an unreadable lid stays an operator precondition', () => {
    expect(
      evaluateHostAwakePreflight({ ...base, ioregClamshellStdout: '"AppleClamshellState" = Yes' })
        .refusals,
    ).toContain('LID_OBSERVED_CLOSED');
    expect(evaluateHostAwakePreflight({ ...base, platform: 'linux' }).refusals).toContain(
      'PLATFORM_NOT_DARWIN',
    );
    const unreadable = evaluateHostAwakePreflight({ ...base, ioregClamshellStdout: null });
    expect(unreadable.verdict).toBe('HOST_AWAKE_PREFLIGHT_PASSED');
    expect(unreadable.advisories).toContain('LID_STATE_UNREADABLE_OPERATOR_PRECONDITION_ONLY');
    expect(unreadable.operatorPreconditions).toContain(LID_OPEN_REQUIRED);
  });

  it('is recorded in the freeze, and alters no classifier, reliability, timeout or pmset setting', () => {
    const contract = F6.freeze.hostAwakeExecutionContract;
    expect(contract.lidRule).toBe(LID_OPEN_REQUIRED);
    expect(contract.wrapper).toEqual(F6_CAFFEINATE_WRAPPER);
    expect(contract.caffeinateDoesNotMakeLidCloseSafe).toBe(true);
    expect(contract.altersClassifierSemantics).toBe(false);
    expect(contract.altersReliabilitySemantics).toBe(false);
    expect(contract.altersTimeoutsRetriesOrWatchdog).toBe(false);
    expect(contract.permanentPmsetChange).toBe(false);
    expect(evaluateHostAwakePreflight(base).altersClassifierSemantics).toBe(false);
    // The contract is the ONLY execution-environment addition: per-run policy is F2's, unchanged.
    expect(F6.freeze.perRunPolicy.identicalToF2PerRunPolicy).toBe(true);
    expect(F6.freeze.perRunPolicy.changedByThisFreeze).toEqual([]);
    expect(F6.freeze.reliability.unchangedBecauseOfHostSleep).toBe(true);
  });
});

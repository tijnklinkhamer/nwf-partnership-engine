/**
 * PHASE 2B-2D2C-F2 — THE FINAL V6 N=5 DEV STUDY FREEZE, VERIFIED.
 *
 * Every identity in the freeze is RE-DERIVED here from the committed
 * artifacts and this build's own production constants, then compared. Nothing
 * is trusted because the freeze says it.
 *
 * ZERO PROVIDER: no inference, no auth-status invocation, no DEV execution,
 * no scoring of a real run, no HOLDOUT path opened, hashed or named as a
 * readable source. This file creates no directory.
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
  FROZEN_DEFAULT_MAX_TURNS,
  FROZEN_MAX_TRANSIENT_RETRIES,
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
  assertF2FreezeAgreesWithProduction,
  F2FreezeError,
  F2_APPROVAL_RECORD_PATH,
  F2_CONTROL_ROOT,
  F2_FREEZE_PATH,
  F2_INHERITED_PLAN_SHA256,
  F2_INTEGRATED_RUNTIME_COMMIT,
  F2_STUDY_ROOT,
  F0Z_RELIABILITY_BASE_COMMIT,
  loadF2FreezeFromBytes,
  PROPOSED_F2_FREEZE_RAW_BYTES,
  PROPOSED_F2_FREEZE_RAW_SHA256,
  PROPOSED_F2_PLAN_SHA256,
  V6_PROMPT_SHA256,
  V6_SEMANTIC_SOURCE_COMMIT,
} from '../harness/phase2b2d2c/f2/freezeF2.js';
import {
  buildF2StudyPlan,
  deriveF2StudyCeilings,
  f2OutputRootPathOf,
  f2PlanOrderIsFrozen,
  f2StudyPlanSha256,
  F2StudyPlanError,
  F2_N_REPLICATES,
  F2_SLOTS,
} from '../harness/phase2b2d2c/f2/studyPlanCoreF2.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const F2_BYTES = readFileSync(join(ROOT, F2_FREEZE_PATH));
const F2 = loadF2FreezeFromBytes(F2_BYTES);

const F0O_BYTES = readFileSync(join(ROOT, F0O_FREEZE_PATH));
const F0O = loadF0OFreezeFromBytes(F0O_BYTES);
const F0O_PLAN = buildF0OExecutionPlan(F0O.freeze, F0O.rawSha256);

const PROMPT_IDENTITY = {
  promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  promptSha256: sha256(Buffer.from(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8')),
  runtimeCommit: F2_INTEGRATED_RUNTIME_COMMIT,
  outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
};
const PLAN = buildF2StudyPlan(F0O_PLAN, f0oPlanSha256(F0O_PLAN), PROMPT_IDENTITY);

describe('2D2C-F2 freeze: identity, status and what it authorises', () => {
  it('is exactly the pinned bytes, and authorises nothing', () => {
    expect(F2.rawSha256).toBe(PROPOSED_F2_FREEZE_RAW_SHA256);
    expect(F2.rawBytes).toBe(PROPOSED_F2_FREEZE_RAW_BYTES);
    expect(F2.freeze.status).toBe('PROPOSED_PENDING_OWNER_FREEZE_APPROVAL');
    expect(F2.freeze.approvalModel.thisFileAuthorises).toEqual([]);
    expect(F2.freeze.exclusions.thisFreezeAuthorises).toEqual([]);
    expect(F2.freeze.approvalModel.ownerFreezeApprovalExists).toBe(false);
    expect(F2.freeze.approvalModel.executionAuthorisationExists).toBe(false);
  });

  it('no owner freeze-approval record exists yet', () => {
    expect(existsSync(join(ROOT, F2_APPROVAL_RECORD_PATH))).toBe(false);
  });

  it('the f2 namespace ships no CLI, execution lock, variant-root verifier or provider import', () => {
    const dir = join(ROOT, 'src/test/harness/phase2b2d2c/f2');
    for (const file of readdirSync(dir)) {
      const source = readFileSync(join(dir, file), 'utf8');
      for (const forbidden of [
        'claude-agent-sdk',
        'child_process',
        'node:child_process',
        'spawn(',
        '--execute',
        'authStatus',
        'query(',
        'node:net',
        'node:https',
      ]) {
        expect(source, `${file} must not name ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe('2D2C-F2 freeze: the two lineages stay separate and are both named', () => {
  it('names the V6 semantic source and the F0Z reliability base, and is not a new semantic version', () => {
    expect(F2.freeze.lineages.semanticSource.commit).toBe(V6_SEMANTIC_SOURCE_COMMIT);
    expect(F2.freeze.lineages.executionReliabilityBase.commit).toBe(F0Z_RELIABILITY_BASE_COMMIT);
    expect(F2.freeze.lineages.integratedRuntime.commit).toBe(F2_INTEGRATED_RUNTIME_COMMIT);
    expect(F2.freeze.lineages.integratedRuntime.isANewSemanticVersion).toBe(false);
    expect(V6_SEMANTIC_SOURCE_COMMIT).not.toBe(F0Z_RELIABILITY_BASE_COMMIT);
  });

  it("the frozen prompt identity IS this build's live prompt, recomputed", () => {
    expect(F2.freeze.lineages.semanticSource.promptSha256).toBe(V6_PROMPT_SHA256);
    expect(F2.freeze.lineages.semanticSource.promptSha256).toBe(PROMPT_IDENTITY.promptSha256);
    expect(F2.freeze.lineages.semanticSource.promptVersion).toBe(ORGUNIT_CLASSIFIER_PROMPT_VERSION);
    expect(F2.freeze.lineages.semanticSource.promptCodePoints).toBe(
      [...ORGUNIT_CLASSIFIER_SYSTEM_PROMPT].length,
    );
    expect(F2.freeze.lineages.semanticSource.promptUtf8Bytes).toBe(
      Buffer.byteLength(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT, 'utf8'),
    );
  });

  it('records that exactly ONE production classifier file changed from the F0Z head', () => {
    expect(
      F2.freeze.lineages.integratedRuntime.productionClassifierFilesChangedFromF0ZHead,
    ).toEqual(['src/orgunits/classify/prompt.ts']);
    expect(F2.freeze.lineages.integratedRuntime.productionClassifierSemanticDeltaCount).toBe(1);
    expect(F2.freeze.lineages.integratedRuntime.reversingOnlyThePromptReproducesF0ZTree).toBe(true);
  });

  it('runs under reliability semantics v2, and C2 is still NOT implemented', () => {
    expect(F2.freeze.reliability.semanticsVersion).toBe(RELIABILITY_SEMANTICS_V2);
    expect(F2.freeze.reliability.c2Implemented).toBe(false);
    expect(F2.freeze.reliability.c2Status).toBe('NOT_IMPLEMENTED');
    expect(F2.freeze.exclusions.noC2).toBe(true);
    expect(F2.freeze.reliability.maxNonTerminalTimeoutsPerReplicate).toBe(
      MAX_NON_TERMINAL_TIMEOUTS_PER_REPLICATE,
    );
  });
});

describe('2D2C-F2 freeze: the five slots and the derived plan', () => {
  it('names V6_REP_1..V6_REP_5, each exactly once, in frozen order', () => {
    expect(F2.freeze.slots).toHaveLength(F2_N_REPLICATES);
    expect(F2.freeze.slots.map((slot) => slot.slotId)).toEqual([
      'V6_REP_1',
      'V6_REP_2',
      'V6_REP_3',
      'V6_REP_4',
      'V6_REP_5',
    ]);
    expect(new Set(F2.freeze.slots.map((slot) => slot.slotId)).size).toBe(F2_N_REPLICATES);
    expect(new Set(F2.freeze.slots.map((slot) => slot.futureOutputRootName)).size).toBe(
      F2_N_REPLICATES,
    );
    expect(F2.freeze.slots.every((slot) => slot.variantName === 'PROMPT_V6_CANONICAL')).toBe(true);
  });

  it('is exactly 5 replicates - never 4, never 6 - and is a single-arm study', () => {
    expect(F2.freeze.studyDesign.nReplicates).toBe(5);
    expect(F2.freeze.studyDesign.totalFreshRuns).toBe(5);
    expect(F2.freeze.studyDesign.arms).toBe(1);
    expect(F2.freeze.studyDesign.pairedComparison).toBe(false);
    expect(F2.freeze.studyDesign.v4OrV5Rerun).toBe(false);
    expect(F2.freeze.studyDesign.nFrozenBeforeAnyInference).toBe(true);
  });

  it('derives to the frozen plan hash, deterministically, with 12 evaluations per replicate', () => {
    expect(f2StudyPlanSha256(PLAN)).toBe(PROPOSED_F2_PLAN_SHA256);
    expect(F2.freeze.derivedStudyPlanSha256).toBe(PROPOSED_F2_PLAN_SHA256);
    // Re-deriving from scratch yields the same bytes.
    const again = buildF2StudyPlan(F0O_PLAN, f0oPlanSha256(F0O_PLAN), PROMPT_IDENTITY);
    expect(f2StudyPlanSha256(again)).toBe(PROPOSED_F2_PLAN_SHA256);
    expect(canonicalStringify(again.slots)).toBe(canonicalStringify(PLAN.slots));

    expect(PLAN.evaluations).toHaveLength(F2_N_REPLICATES * EXPECTED_LOGICAL_BATCHES_PER_VARIANT);
    expect(f2PlanOrderIsFrozen(PLAN)).toBe(true);
    for (const slot of F2_SLOTS) {
      const forSlot = PLAN.evaluations.filter((e) => e.slotId === slot.slotId);
      expect(forSlot).toHaveLength(EXPECTED_LOGICAL_BATCHES_PER_VARIANT);
      const goldIds = forSlot.flatMap((e) => e.orderedGoldIds);
      expect(goldIds).toHaveLength(EXPECTED_CORPUS_ITEM_COUNT);
      expect(new Set(goldIds).size).toBe(EXPECTED_CORPUS_ITEM_COUNT);
    }
  });

  it('inherits the attempt-4 batch partition VERBATIM, and recomputes only the V6 call identity', () => {
    expect(f0oPlanSha256(F0O_PLAN)).toBe(F2_INHERITED_PLAN_SHA256);
    expect(F2.freeze.batching.inheritedPlanSha256).toBe(F2_INHERITED_PLAN_SHA256);
    const firstReplicate = PLAN.evaluations.slice(0, EXPECTED_LOGICAL_BATCHES_PER_VARIANT);
    firstReplicate.forEach((evaluation, index) => {
      const source = F0O_PLAN.evaluations[index]!;
      // Inherited, byte for byte.
      expect(evaluation.assemblyInputSha256).toBe(source.assemblyInputSha256);
      expect(evaluation.orderedGoldIds).toEqual(source.orderedGoldIds);
      expect(evaluation.orderedDocIndices).toEqual(source.orderedDocIndices);
      expect(evaluation.logicalBatchOrdinal).toBe(source.logicalBatchOrdinal);
      // Recomputed: the call identity folds in the prompt version, so a V6
      // call is NOT the V5 call over the same assembled bytes.
      expect(evaluation.finalInputSha256).not.toBe(source.finalInputSha256);
      expect(evaluation.promptVersion).toBe('orgunit-classifier-prompt-v6');
    });
  });

  it('every replicate carries the SAME 12 assembly inputs - the partition does not drift between slots', () => {
    const perSlot = F2_SLOTS.map((slot) =>
      PLAN.evaluations
        .filter((evaluation) => evaluation.slotId === slot.slotId)
        .map((evaluation) => evaluation.assemblyInputSha256),
    );
    for (const assemblies of perSlot) expect(assemblies).toEqual(perSlot[0]);
  });
});

describe('2D2C-F2 freeze: the request ceilings are DERIVED, never asserted', () => {
  it('derives 61 provider requests / 183 adapter attempts per run, by summing the 12 batches', () => {
    const ceilings = deriveF2StudyCeilings(
      F0O_PLAN.evaluations.map((evaluation) => evaluation.callCeiling),
    );
    expect(ceilings.perRunLogicalEvaluations).toBe(12);
    expect(ceilings.perRunOriginalRequests).toBe(12);
    expect(ceilings.perRunDocuments).toBe(49);
    expect(ceilings.perRunMaxRepairRequests).toBe(49);
    expect(ceilings.perRunMaxProviderRequests).toBe(61);
    expect(ceilings.perRunMaxAdapterAttempts).toBe(183);
    // 61 = 12 originals + 49 repairs; 183 = 61 x (1 + 2 transient retries).
    expect(ceilings.perRunMaxProviderRequests).toBe(
      ceilings.perRunOriginalRequests + ceilings.perRunMaxRepairRequests,
    );
    expect(ceilings.perRunMaxAdapterAttempts).toBe(
      ceilings.perRunMaxProviderRequests * (FROZEN_MAX_TRANSIENT_RETRIES + 1),
    );
  });

  it('derives 60 evaluations / 305 provider requests / 915 adapter attempts for the whole study', () => {
    const ceilings = deriveF2StudyCeilings(
      F0O_PLAN.evaluations.map((evaluation) => evaluation.callCeiling),
    );
    expect(ceilings.totalSlots).toBe(5);
    expect(ceilings.fullStudyLogicalEvaluations).toBe(60);
    expect(ceilings.fullStudyMaxProviderRequests).toBe(305);
    expect(ceilings.fullStudyMaxAdapterAttempts).toBe(915);
    expect(F2.freeze.requestCeilings.fullStudy).toMatchObject({
      totalSlots: 5,
      plannedLogicalEvaluations: 60,
      totalProviderRequestCeiling: 305,
      adapterAttemptCeiling: 915,
    });
  });

  it('the study total is a genuine SUM over the slots, not a literal', () => {
    const ceilings = deriveF2StudyCeilings(
      F0O_PLAN.evaluations.map((evaluation) => evaluation.callCeiling),
    );
    // Exactly five slot-sized contributions, and nothing else. A study of a
    // different size would not land on 305/915, so the figure is sensitive to
    // the slot count rather than a hardcoded constant.
    expect(ceilings.fullStudyMaxProviderRequests).toBe(ceilings.perRunMaxProviderRequests * 5);
    expect(ceilings.fullStudyMaxProviderRequests).not.toBe(ceilings.perRunMaxProviderRequests * 4);
    expect(ceilings.fullStudyMaxProviderRequests).not.toBe(ceilings.perRunMaxProviderRequests * 6);
    expect(ceilings.fullStudyMaxAdapterAttempts).toBe(ceilings.perRunMaxAdapterAttempts * 5);
    expect(ceilings.fullStudyLogicalEvaluations).toBe(ceilings.perRunLogicalEvaluations * 5);
  });

  it('refuses to derive a ceiling from a source plan that is not exactly 12 evaluations', () => {
    const ceilings = F0O_PLAN.evaluations.map((evaluation) => evaluation.callCeiling);
    expect(() => deriveF2StudyCeilings(ceilings.slice(0, 11))).toThrow(F2StudyPlanError);
    expect(() => deriveF2StudyCeilings([...ceilings, ceilings[0]!])).toThrow(F2StudyPlanError);
  });

  it('refuses a slot set that is not exactly five - N cannot become 4 or 6 by accident', () => {
    const ceilings = F0O_PLAN.evaluations.map((evaluation) => evaluation.callCeiling);
    expect(() => deriveF2StudyCeilings(ceilings, F2_SLOTS.slice(0, 4))).toThrow(F2StudyPlanError);
    expect(() => deriveF2StudyCeilings(ceilings, [...F2_SLOTS, F2_SLOTS[0]!])).toThrow(
      F2StudyPlanError,
    );
    expect(() => buildF2StudyPlan(F0O_PLAN, 'x', PROMPT_IDENTITY, F2_SLOTS.slice(0, 4))).toThrow(
      F2StudyPlanError,
    );
    expect(() =>
      buildF2StudyPlan(F0O_PLAN, 'x', PROMPT_IDENTITY, [...F2_SLOTS, F2_SLOTS[0]!]),
    ).toThrow(F2StudyPlanError);
  });
});

describe('2D2C-F2 freeze: MUTATION is refused', () => {
  it('refuses a single flipped byte', () => {
    const mutated = Buffer.from(F2_BYTES);
    mutated[mutated.length - 2] = mutated[mutated.length - 2]! ^ 0x01;
    expect(() => loadF2FreezeFromBytes(mutated)).toThrow(F2FreezeError);
  });

  it('refuses reordered slots', () => {
    const freeze = clone(F2.freeze);
    const slots = [...freeze.slots];
    [slots[0], slots[1]] = [slots[1]!, slots[0]!];
    expect(() => assertF2FreezeAgreesWithProduction({ ...freeze, slots })).toThrow(
      /out of frozen order|not the frozen/,
    );
  });

  it('refuses a duplicated slot id', () => {
    const freeze = clone(F2.freeze);
    const slots = [...freeze.slots];
    slots[4] = { ...slots[4]!, slotId: 'V6_REP_1' };
    expect(() => assertF2FreezeAgreesWithProduction({ ...freeze, slots })).toThrow(F2FreezeError);
  });

  it('refuses a full-study ceiling that is not the sum of the five slots', () => {
    const freeze = clone(F2.freeze);
    freeze.requestCeilings.fullStudy.totalProviderRequestCeiling = 300;
    expect(() => assertF2FreezeAgreesWithProduction(freeze)).toThrow(/sum of the five slots/);
  });

  it('refuses a per-run provider ceiling that is not originals + repairs', () => {
    const freeze = clone(F2.freeze);
    freeze.requestCeilings.perRun.totalProviderRequestCeiling = 60;
    expect(() => assertF2FreezeAgreesWithProduction(freeze)).toThrow(/originalRequests/);
  });

  it('refuses a plan built against a prompt that is not V6', () => {
    expect(() =>
      buildF2StudyPlan(F0O_PLAN, 'x', {
        ...PROMPT_IDENTITY,
        promptVersion: 'orgunit-classifier-prompt-v5',
      }),
    ).toThrow(F2StudyPlanError);
  });
});

describe('2D2C-F2 freeze: gold, gates and the corpus are unchanged', () => {
  it('recomputes the canonical corpus and manifest hashes live', () => {
    expect(sha256(readFileSync(join(ROOT, F2.freeze.corpus.canonicalCorpusPath)))).toBe(
      F2.freeze.corpus.derivedCorpusRawSha256,
    );
    expect(sha256(readFileSync(join(ROOT, F2.freeze.corpus.canonicalManifestPath)))).toBe(
      F2.freeze.corpus.derivedManifestRawSha256,
    );
    expect(F2.freeze.corpus.itemCount).toBe(EXPECTED_CORPUS_ITEM_COUNT);
  });

  it('recomputes the DEV gold hash live, and changes no gold', () => {
    expect(sha256(readFileSync(join(ROOT, F2.freeze.gold.devLabelsPath)))).toBe(
      F2.freeze.gold.devLabelsRawSha256,
    );
    expect(F2.freeze.gold.goldUnchangedFromHistoricalStudies).toBe(true);
    expect(F2.freeze.gold.goldChangesAuthorisedByThisFreeze).toEqual([]);
    expect(F2.freeze.exclusions.noGoldChanges).toBe(true);
  });

  it('restates the six frozen DEV gates at their existing thresholds, and changes none', () => {
    expect(F2.freeze.sixFrozenDevGates).toMatchObject({
      minSchemaValidSpanVerifiedRate: 0.99,
      minUnitPageRecall: 0.95,
      minUnitPagePrecision: 0.9,
      minUnitTypeAccuracy: 0.85,
      minHardNegativeRejection: 0.9,
      maxNeedsReviewRate: 0.15,
    });
    for (const [gate, threshold] of Object.entries(F2.freeze.sixFrozenDevGates)) {
      expect((F0O.freeze.scoring.gates as Record<string, number>)[gate]).toBe(threshold);
    }
    expect(F2.freeze.gateThresholdsChangedByThisFreeze).toEqual([]);
    expect(F2.freeze.exclusions.noThresholdChanges).toBe(true);
  });

  it('keeps every frozen liveness, retry and maxTurns value', () => {
    expect(F2.freeze.perRunPolicy.runConfig.maxTurns).toBe(FROZEN_DEFAULT_MAX_TURNS);
    expect(F2.freeze.requestCeilings.maxTransientRetriesPerRequest).toBe(
      FROZEN_MAX_TRANSIENT_RETRIES,
    );
    expect(canonicalStringify(F2.freeze.perRunPolicy.liveness)).toBe(
      canonicalStringify(F0O.freeze.liveness),
    );
    expect(canonicalStringify(F2.freeze.perRunPolicy.repairPolicy)).toBe(
      canonicalStringify(F0O.freeze.repairPolicy),
    );
    expect(F2.freeze.perRunPolicy.requestedModelId).toBe(F0O.freeze.classifier.requestedModelId);
    expect(F2.freeze.exclusions.noTimeoutRetryOrMaxTurnsChanges).toBe(true);
  });
});

describe('2D2C-F2 freeze: HOLDOUT, output roots and the execution boundary', () => {
  it('forbids HOLDOUT, and this test file opens none of the forbidden paths', () => {
    expect(F2.freeze.holdout.inferenceDuring2D2C).toBe('FORBIDDEN');
    expect(F2.freeze.holdout.accessDuringThisStudy).toBe('FORBIDDEN');
    expect(F2.freeze.holdout.openedOrHashedByF2).toBe(false);
    expect(F2.freeze.corpus.noneOpenedByF2).toBe(true);

    const forbidden = [
      ...F2.freeze.corpus.holdoutFilesNeverRead,
      ...F2.freeze.corpus.additionalForbiddenFilesForThisStudy,
    ];
    expect(forbidden).toHaveLength(4);
    const thisFile = readFileSync(
      join(ROOT, 'src/test/unit/orgunitClassify2D2CF2Freeze.test.ts'),
      'utf8',
    );
    const f2Dir = join(ROOT, 'src/test/harness/phase2b2d2c/f2');
    const harnessSources = readdirSync(f2Dir)
      .map((file) => readFileSync(join(f2Dir, file), 'utf8'))
      .join('\n');
    for (const path of forbidden) {
      expect(thisFile).not.toContain(path);
      expect(harnessSources).not.toContain(path);
      // ...and the freeze never names a forbidden file as a readable source.
      expect(F2.freeze.corpus.canonicalCorpusPath).not.toBe(path);
      expect(F2.freeze.gold.devLabelsPath).not.toBe(path);
    }
  });

  it('uses a completely fresh output namespace and reuses no prior study root', () => {
    expect(F2.freeze.outputRoots.studyRoot).toBe(F2_STUDY_ROOT);
    expect(F2.freeze.outputRoots.controlRoot).toBe(F2_CONTROL_ROOT);
    expect(F2_STUDY_ROOT).not.toBe(F2_CONTROL_ROOT);
    expect(F2.freeze.outputRoots.freshNamespace).toBe(true);
    expect(F2.freeze.outputRoots.createdByThisFile).toBe(0);
    for (const stale of F2.freeze.outputRoots.mustNotReuse) {
      expect(F2_STUDY_ROOT).not.toBe(stale);
      expect(F2_CONTROL_ROOT).not.toBe(stale);
      expect(F2_STUDY_ROOT.startsWith(`${stale}/`)).toBe(false);
    }
    expect(F2.freeze.outputRoots.noOutputDirectoryContainsSemanticResultsYet).toBe(true);
  });

  it('neither the study root nor any of the five slot roots exists yet', () => {
    expect(existsSync(F2_STUDY_ROOT)).toBe(false);
    expect(existsSync(F2_CONTROL_ROOT)).toBe(false);
    for (const slot of F2_SLOTS) {
      expect(existsSync(f2OutputRootPathOf(F2_STUDY_ROOT, slot))).toBe(false);
    }
    expect(new Set(F2_SLOTS.map((slot) => f2OutputRootPathOf(F2_STUDY_ROOT, slot))).size).toBe(
      F2_N_REPLICATES,
    );
  });

  it('forbids scoring before all five slots are terminal, and any adaptive execution', () => {
    expect(F2.freeze.executionBoundary.allFiveSlotsTerminalBeforeAnyScoringBegins).toBe(true);
    expect(F2.freeze.executionBoundary.noGateScoringBetweenReplicates).toBe(true);
    expect(F2.freeze.executionBoundary.noSemanticResultInspectionBetweenReplicates).toBe(true);
    expect(F2.freeze.executionBoundary.noPromptEditAfterAnyV6ProviderRequest).toBe(true);
    expect(F2.freeze.executionBoundary.scoringRequiresSeparateOwnerAuthorisation).toBe(true);
    expect(F2.freeze.executionBoundary.goldBlind).toBe(true);
    expect(F2.freeze.executionBoundary.noGoldLoadedByTheInferencePath).toBe(true);

    expect(F2.freeze.noAdaptiveScoring.nFrozenBeforeInference).toBe(true);
    expect(F2.freeze.noAdaptiveScoring.slotCountFixedAt).toBe(5);
    expect(F2.freeze.noAdaptiveScoring.slotOrderFixed).toBe(true);
    expect(F2.freeze.noAdaptiveScoring.analysisContractFixed).toBe(true);
    expect(F2.freeze.noAdaptiveScoring.noAdaptiveStoppingBecauseEarlyResultsLookGoodOrBad).toBe(
      true,
    );
  });

  it('preserves the timeout ceiling and forbids a duplicate logical evaluation after continuation', () => {
    expect(F2.freeze.reliability.maxNonTerminalTimeoutsPerReplicate).toBe(2);
    expect(F2.freeze.reliability.timeoutContinuationRule).toContain('NEVER rerun');
    expect(F2.freeze.reliability.noDuplicateLogicalEvaluationAfterContinuation).toContain(
      'never re-attempted',
    );
    expect(F2.freeze.reliability.noDuplicateLogicalEvaluationAfterContinuation).toContain(
      'ever executed twice',
    );
  });

  it('keeps the three inclusion classes, and never silently substitutes a replicate', () => {
    expect(F2.freeze.inclusionRules.classA.id).toBe('FAILURE_BEFORE_AUTHORISATION_CONSUMPTION');
    expect(F2.freeze.inclusionRules.classB.id).toBe(
      'AUTHORISATION_CONSUMED_CONFIRMED_PRE_INFERENCE_REFUSAL',
    );
    expect(F2.freeze.inclusionRules.classC.id).toBe(
      'PROVIDER_REQUEST_OR_SEMANTIC_EXECUTION_OBSERVED',
    );
    expect(F2.freeze.inclusionRules.terminalFailureIncludedAsRecorded).toBe(true);
    expect(F2.freeze.inclusionRules.neverSilentlySubstituteAReplicate).toBe(true);
  });
});

describe('2D2C-F2: the final DEV decision rule cannot be softened', () => {
  it('requires 5/5 COMPLETE and 5/5 passing every frozen gate', () => {
    const rule = F2.freeze.finalDevDecisionRule;
    expect(rule.decision).toBe('DEV_READY_FOR_HOLDOUT');
    expect(rule.conditions).toHaveLength(2);
    expect(rule.conditions[0]).toContain('5/5');
    expect(rule.conditions[1]).toContain('every one of the six frozen DEV gates');
  });

  it('cannot accept 4/5, cannot average, cannot tune, cannot replace', () => {
    const rule = F2.freeze.finalDevDecisionRule;
    expect(rule.noFourOfFiveFallback).toBe(true);
    expect(rule.noAveragingAwayAFailingReplicate).toBe(true);
    expect(rule.noThresholdTuningAfterOutcomes).toBe(true);
    expect(rule.noReplacementOfAFailedReplicate).toBe(true);
  });

  it('any partial replicate, or any per-replicate gate failure, is DEV_NOT_READY_FOR_HOLDOUT', () => {
    const rule = F2.freeze.finalDevDecisionRule;
    expect(rule.anyPartialReplicate).toBe('DEV_NOT_READY_FOR_HOLDOUT');
    expect(rule.anyCompleteReplicateFailingAnyFrozenGate).toBe('DEV_NOT_READY_FOR_HOLDOUT');
    expect(rule.unmeasuredGateIsNeverAPassedGate).toBe(true);
  });

  it('reconciles with the prior per-run acceptance rule rather than silently replacing it', () => {
    const reconciliation = F2.freeze.finalDevDecisionRule.priorRuleReconciliation;
    expect(reconciliation.relationship).toBe('SUBSUMED_AND_STRENGTHENED_NOT_CONFLICTING');
    expect(reconciliation.stricterExistingRuleFound).toBe(false);
    expect(reconciliation.conflictingExistingRuleFound).toBe(false);
    // The prior rule really does exist, and really is a single-run criterion.
    expect(F0O.freeze.scoring.acceptanceRule).toContain(
      'HOLDOUT stays forbidden until a DEV candidate passes every frozen gate',
    );
  });

  it('a DEV_READY_FOR_HOLDOUT outcome is still NOT a HOLDOUT authorisation', () => {
    expect(F2.freeze.holdout.rule).toContain('remains prohibited until separately authorised');
  });
});

/**
 * PHASE 2B-2D2C-F9 — THE DETERMINISTIC F6 DEV SCORING RESULT, AND ITS
 * SECONDARY DIAGNOSTICS.
 *
 * `buildF9ScoringResult` binds every identity the scoring pass read to the
 * scorer's own replicate outcomes and to the mechanically-applied
 * `F6_FINAL_DEV_DECISION_RULE_V1`. The POST-DECISION diagnostics are computed
 * only from the same five scored replicates, AFTER the decision exists, and
 * are never read back by it.
 *
 * The bytes are `canonicalStringify` of a plain-JSON projection — the
 * repository's deterministic convention, as the Recovery-1 result used.
 *
 * PURE. No filesystem, no network, no clock.
 */
import { canonicalStringify } from '../../../../orgunits/classify/canonical.js';
import { RELIABILITY_SEMANTICS_V2 } from '../constants.js';
import { F2_FREEZE_PATH } from '../f2/freezeF2.js';
import type { ScoredReplicateV2 } from '../f2/scoreV2.js';
import { F6_APPROVAL_RECORD_PATH, F6_FREEZE_PATH } from '../f6/freezeF6.js';
import { F6_SLOTS, F6_STUDY_ID, F6_STUDY_ROOT, F6_CONTROL_ROOT } from '../f6/studyPlanCoreF6.js';
import {
  F9_DECISION_RULE_ID,
  F9_EXECUTION_PINS,
  F9_GOLD_PINS,
  F9_SCORING_RESULT_VERSION,
  F9_SIX_FROZEN_GATES,
  type F9ScoringRun,
} from './scoreF6StudyF9.js';

export interface F9ScoringBindings {
  /** The exact committed scoring build the pass ran at. */
  readonly scoringBuildCommit: string;
}

export interface F9ItemDiagnostic {
  readonly goldId: string;
  readonly goldVerdict: string | null;
  readonly resultsAcrossReplicates: readonly string[];
  readonly verdictCorrectCount: number;
  readonly falsePositiveUnitPageCount: number;
  readonly falseNegativeUnitPageCount: number;
  readonly needsReviewCount: number;
  readonly repairTriggeredCount: number;
  readonly stability: 'ALWAYS_CORRECT' | 'STABLE_ERROR' | 'INTERMITTENT_ERROR';
}

/** POST-DECISION ONLY. Reads the scored rows; the decision never reads this. */
export function f9PostDecisionDiagnostics(replicates: readonly ScoredReplicateV2[]) {
  const goldIds = replicates[0]?.items.map((item) => item.goldId) ?? [];
  const items: F9ItemDiagnostic[] = goldIds.map((goldId) => {
    const rows = replicates.map((replicate) =>
      replicate.items.find((item) => item.goldId === goldId)!,
    );
    const goldVerdict = rows[0]?.scored?.gold['verdict'] ?? null;
    let correct = 0;
    let fp = 0;
    let fn = 0;
    let review = 0;
    let repaired = 0;
    for (const row of rows) {
      if (row.result === goldVerdict) correct += 1;
      if (row.result === 'UNIT_PAGE' && goldVerdict !== 'UNIT_PAGE') fp += 1;
      if (goldVerdict === 'UNIT_PAGE' && row.result !== 'UNIT_PAGE') fn += 1;
      if (row.result === 'NEEDS_REVIEW') review += 1;
      if (row.repairTriggered === true) repaired += 1;
    }
    return {
      goldId,
      goldVerdict,
      resultsAcrossReplicates: rows.map((row) => row.result),
      verdictCorrectCount: correct,
      falsePositiveUnitPageCount: fp,
      falseNegativeUnitPageCount: fn,
      needsReviewCount: review,
      repairTriggeredCount: repaired,
      stability:
        correct === rows.length
          ? 'ALWAYS_CORRECT'
          : correct === 0
            ? 'STABLE_ERROR'
            : 'INTERMITTENT_ERROR',
    };
  });
  const perReplicate = replicates.map((replicate) => ({
    slotId: replicate.slotId,
    repairTriggeredItems: replicate.items.filter((i) => i.repairTriggered === true).length,
    firstPassAcceptedItems: replicate.items.filter((i) => i.firstPassAccepted === true).length,
    postRepairAcceptedItems: replicate.items.filter((i) => i.postRepairAccepted === true).length,
    needsReviewItems: replicate.items.filter((i) => i.result === 'NEEDS_REVIEW').length,
    verdictErrorItems: items.filter(
      (d) => replicate.items.find((i) => i.goldId === d.goldId)!.result !== d.goldVerdict,
    ).length,
  }));
  return {
    label: 'POST-DECISION DEV DIAGNOSTICS — NOT PART OF THE FROZEN DECISION RULE',
    readByDecisionRule: false,
    comparedWithF5: false,
    perReplicate,
    itemsWithAnyVerdictError: items.filter((d) => d.stability !== 'ALWAYS_CORRECT'),
    stableErrorItemCount: items.filter((d) => d.stability === 'STABLE_ERROR').length,
    intermittentErrorItemCount: items.filter((d) => d.stability === 'INTERMITTENT_ERROR').length,
    alwaysCorrectItemCount: items.filter((d) => d.stability === 'ALWAYS_CORRECT').length,
  };
}

/** The plain-JSON result object. Every value is JSON-representable. */
export function buildF9ScoringResult(run: F9ScoringRun, bindings: F9ScoringBindings) {
  const { context, gold, replicates, gateResults, decision, studyRootInventory } = run;
  const study = context.study;
  const replicateScores = replicates.map((replicate) => {
    if (replicate.gateVector.kind !== 'NUMERIC') throw new Error('unreachable: no gate vector');
    const gates = gateResults.find((g) => g.slotId === replicate.slotId)!.gates;
    return {
      slotId: replicate.slotId,
      variantName: replicate.variantName,
      replicateStatus: replicate.replicateStatus,
      terminalCondition: replicate.terminalCondition,
      itemDenominator: replicate.items.length,
      observedInvalidBatches: replicate.observedInvalidBatches,
      itemResultCounts: Object.fromEntries(
        [...new Set(replicate.items.map((i) => i.result))]
          .sort()
          .map((result) => [result, replicate.items.filter((i) => i.result === result).length]),
      ),
      sixFrozenGates: gates,
      devGateOutcome: replicate.gateVector.devGateOutcome,
      metrics: replicate.gateVector.metrics,
      items: replicate.items.map((item) => ({
        goldId: item.goldId,
        result: item.result,
        unitType: item.unitType,
        firstPassAccepted: item.firstPassAccepted,
        postRepairAccepted: item.postRepairAccepted,
        repairTriggered: item.repairTriggered,
        goldVerdict: item.scored?.gold['verdict'] ?? null,
      })),
    };
  });
  return {
    resultVersion: F9_SCORING_RESULT_VERSION,
    scope: 'DEVELOPMENT_ONLY',
    studyId: F6_STUDY_ID,
    builds: {
      executionBuildCommit: F9_EXECUTION_PINS.executionBuildCommit,
      scoringBuildCommit: bindings.scoringBuildCommit,
      integratedRuntimeCommit: study.f4.f2Freeze.lineages.integratedRuntime.commit,
    },
    freezes: {
      f6Freeze: {
        path: F6_FREEZE_PATH,
        rawSha256: study.f6FreezeRawSha256,
        rawBytes: study.f6FreezeRawBytes,
      },
      f6PlanSha256: study.f6PlanSha256,
      f6OwnerFreezeApproval: {
        path: F6_APPROVAL_RECORD_PATH,
        rawSha256: study.f6OwnerFreezeApprovalRawSha256,
        rawBytes: study.f6OwnerFreezeApprovalRawBytes,
      },
      f2Freeze: { path: F2_FREEZE_PATH, rawSha256: study.f4.f2FreezeRawSha256 },
      f2PlanSha256: study.f4.f2PlanSha256,
      f0oFreezeRawSha256: study.f4.f0oFreezeRawSha256,
    },
    execution: {
      studyRoot: F6_STUDY_ROOT,
      controlRoot: F6_CONTROL_ROOT,
      studyExecutionApproval: {
        path: `${F6_CONTROL_ROOT}/STUDY_EXECUTION_APPROVAL_F8.json`,
        rawSha256: F9_EXECUTION_PINS.studyExecutionApprovalSha256,
        rawBytes: F9_EXECUTION_PINS.studyExecutionApprovalBytes,
      },
      studyRootInventory,
      studyRootInventoryUnchangedAfterScoring: true,
      slotIds: F6_SLOTS.map((slot) => slot.slotId),
      candidateAuthorisationSha256BySlot: F9_EXECUTION_PINS.candidateAuthorisationSha256BySlot,
    },
    prompt: {
      promptVersion: study.f4.f2Freeze.lineages.semanticSource.promptVersion,
      promptSha256: study.f4.f2Freeze.lineages.semanticSource.promptSha256,
    },
    reliabilitySemanticsVersion: RELIABILITY_SEMANTICS_V2,
    c2Status: 'NOT_IMPLEMENTED',
    corpus: {
      scope: 'DEVELOPMENT',
      itemCount: context.corpusRows.length,
      corpusRawSha256: context.corpusRawSha256,
      corpusManifestRawSha256: context.corpusManifestRawSha256,
      corpusContentSha256: context.corpusContentSha256,
    },
    gold: {
      devLabels: { path: F9_GOLD_PINS.devLabelsPath, ...gold.devLabels },
      devLabelsManifest: { path: F9_GOLD_PINS.devLabelsManifestPath, ...gold.devLabelsManifest },
      scoringSupplement: { path: F9_GOLD_PINS.scoringSupplementPath, ...gold.scoringSupplement },
      supplementVersion: gold.supplement.supplementVersion,
      labelCount: gold.supplement.labelCount,
      preservedGold: { goldId: gold.preservedGoldId, committedLabel: gold.preservedLabel },
    },
    scorer: {
      module: 'src/test/harness/phase2b2d2c/f2/scoreV2.ts',
      function: 'scoreReplicateV2',
      frozenGateThresholds: context.gates,
      sixFrozenGates: F9_SIX_FROZEN_GATES,
      gateDecisionAuthority:
        'the frozen scorer met; an exact integer-ratio re-evaluation must agree',
    },
    replicates: replicateScores,
    frozenDecision: {
      rule: F9_DECISION_RULE_ID,
      completeReplicates: decision.completeReplicates,
      replicatesPassingAllSixGates: decision.replicatesPassingAllSixGates,
      requiredForReady: F6_SLOTS.length,
      decision: decision.decision,
      noFourOfFiveFallback: true,
      noAveragingOrPooling: true,
      decisionIsNotAHoldoutAuthorisation: true,
    },
    exclusions: {
      f5StudyId: 'FINAL_V6_DEV_N5',
      f5Excluded: true,
      f5Scored: false,
      f5ObservationsInAnyDenominator: 0,
      holdoutAccessed: false,
      ownerAdjudicationRecordOpened: false,
      providerCalls: 0,
      inference: 0,
      authStatusInvocations: 0,
    },
    postDecisionDiagnostics: f9PostDecisionDiagnostics(replicates),
  };
}

/** The canonical bytes written as the one immutable result. */
export function f9ScoringResultBytes(result: ReturnType<typeof buildF9ScoringResult>): string {
  return canonicalStringify(JSON.parse(JSON.stringify(result)) as unknown);
}

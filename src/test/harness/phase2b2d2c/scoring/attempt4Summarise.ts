/**
 * PHASE 2B-2D2C-F0S — THE DETERMINISTIC ATTEMPT-4 SUMMARY.
 *
 * Everything here is a function of the verified sources: the attempt-4
 * PROMPT_V5_CANONICAL rows (POST-REPAIR validity, per ADR 0011 and the F0O
 * `postRepairTreatment`), the read-only attempt-1 V1/V2 comparator rows,
 * the read-only attempt-2 V3 comparator rows (itself POST-REPAIR, per F0E),
 * the read-only attempt-3 V4 comparator rows (itself POST-REPAIR, per F0I),
 * and the F0O freeze's own gates. First-pass validity is ALWAYS reported
 * beside the post-repair figures and is never hidden — for BOTH the
 * candidate and the V3/V4 comparators.
 *
 * What is NOT here: any acceptance decision. `devGateOutcome` states
 * whether every frozen gate was met on the DEVELOPMENT split — as DATA — and
 * `holdoutEligibility` restates the freeze's own rule that HOLDOUT stays
 * forbidden until a DEV candidate passes every frozen gate AND a separate
 * owner authorisation exists. Nothing here authorises anything.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import type { GoldAvailability } from './gold.js';
import { rate } from './metrics.js';
import {
  CONCORDANCE_FIELD_NAMES,
  countConcordance,
  countCorrectnessTransitions,
  countValidityTransitions,
  type ConcordanceCounts,
  type CorrectnessTransitionCounts,
  type PairedItem,
  type ValidityTransitionCounts,
} from './paired.js';
import type { ScoredItem } from './score.js';
import type { LoadedEvaluation, LoadedSources, ScoredVariantName } from './sources.js';
import type { LoadedAttempt2Sources } from './attempt2Sources.js';
import type { LoadedAttempt3Sources } from './attempt3Sources.js';
import type { LoadedAttempt4Sources } from './attempt4Sources.js';
import {
  distributionOf,
  semanticMetricsOf,
  type GateOutcome,
  type VariantSemanticMetrics,
} from './summarise.js';
import { GOLD_BACKED_FIELDS } from './gold.js';
import type { LoadedGoldSupplement } from './supplement.js';
import type { LoadedOwnerAdjudication } from './adjudication.js';

/** Versions the attempt-4 SCORING RULES. Any change to how a row or a summary is derived changes this. */
export const ATTEMPT4_SCORER_VERSION = 'phase2b-2d2c-f0s-attempt4-scorer-v1';
/** Versions the attempt-4 derived-output SHAPE. */
export const ATTEMPT4_OUTPUT_SCHEMA_VERSION = 'phase2b-2d2c-f0s-attempt4-summary-v1';

export type DevGateOutcome =
  'ALL_FROZEN_GATES_MET_ON_DEV' | 'FROZEN_GATES_FAILED_ON_DEV' | 'INSUFFICIENT_VALID_DEV_EVIDENCE';

export interface ValidityCounts {
  readonly accepted: number;
  readonly rejected: number;
  readonly rate: number | null;
  readonly rejectionsByCategory: Readonly<Record<string, number>>;
}

export interface CandidateSummary {
  readonly variantName: 'PROMPT_V5_CANONICAL';
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly variantGitCommit: string;
  readonly items: number;
  /** What the ORIGINAL calls produced, before any repair. */
  readonly firstPass: ValidityCounts;
  /** After the ONE bounded repair round; every gate below is applied to this. */
  readonly postRepair: ValidityCounts;
  readonly recoveredByRepair: number;
  /** Gold-free distribution of each structured field's answers, post-repair. */
  readonly predictionDistribution: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly wallTimeMs: number;
}

export interface Attempt4RepairSummary {
  readonly gatesAppliedTo: 'POST_REPAIR_VALIDITY';
  readonly firstPassRateAlwaysReported: true;
  readonly evaluationsWithARound: number;
  readonly repairs: {
    readonly planned: number;
    readonly executed: number;
    readonly accepted: number;
    readonly rejected: number;
    readonly providerFailed: number;
    readonly skipped: number;
  };
  readonly repairInputTokens: number;
  readonly repairOutputTokens: number;
  readonly repairWallTimeMs: number;
  readonly artifactInventory: { readonly count: number; readonly sha256: string };
  readonly artifactsVerified: number;
  readonly policy: { readonly enabled: boolean; readonly minimumRemainingBudgetMs: number };
}

export interface ComparatorMovement {
  readonly comparator:
    'PROMPT_V1_CANONICAL' | 'PROMPT_V2_CANONICAL' | 'PROMPT_V3_CANONICAL' | 'PROMPT_V4_CANONICAL';
  readonly pairs: number;
  /** comparator -> V5. */
  readonly validity: ValidityTransitionCounts;
  readonly correctnessByField: readonly CorrectnessTransitionCounts[];
  readonly concordanceByField: readonly ConcordanceCounts[];
  /** Items whose validator state changed, by gold id, so no recovery or loss is a bare number. */
  readonly recoveredByV5: readonly string[];
  readonly lostByV5: readonly string[];
  /** Verdict-level movements against gold, by gold id (empty when no gold is available). */
  readonly verdictCorrections: readonly string[];
  readonly verdictRegressions: readonly string[];
}

export interface PageVersusUnitFailures {
  /** Gold UNIT_PAGE answered NOT_A_UNIT by a validator-accepted result. */
  readonly goldUnitPageAnsweredNotAUnit: readonly string[];
  /** Gold hard negatives answered UNIT_PAGE by a validator-accepted result. */
  readonly hardNegativesAnsweredUnitPage: readonly string[];
  /** Gold UNIT_PAGE items the validator rejected post-repair (a STRICT miss). */
  readonly goldUnitPageValidatorRejected: readonly string[];
}

export interface PerBatchCost {
  readonly logicalBatchOrdinal: number;
  readonly echeRowKey: string;
  readonly documents: number;
  readonly v5: {
    readonly wallTimeMs: number | null;
    readonly inputTokens: number | null;
    readonly outputTokens: number | null;
    readonly repairWallTimeMs: number;
    readonly repairExecuted: number;
  };
  readonly v1: { readonly wallTimeMs: number | null; readonly outputTokens: number | null };
  readonly v2: { readonly wallTimeMs: number | null; readonly outputTokens: number | null };
  readonly v3: { readonly wallTimeMs: number | null; readonly outputTokens: number | null };
  readonly v4: { readonly wallTimeMs: number | null; readonly outputTokens: number | null };
}

export interface Attempt4Summary {
  readonly scorerVersion: string;
  readonly outputSchemaVersion: string;
  readonly attemptNo: 4;
  readonly sources: {
    readonly attempt4: {
      readonly freezeVersion: string;
      readonly freezeRawSha256: string;
      readonly planSha256: string;
      readonly artifactsVerified: number;
      readonly artifactInventorySha256: string;
      readonly repairArtifactInventory: { readonly count: number; readonly sha256: string };
      readonly consumptionMarkerSha256: string;
      readonly authorisationSha256: string;
      readonly consumedAtUtc: string;
      readonly experimentStatus: string;
      readonly experimentCompletedAtUtc: string;
    };
    readonly attempt1Comparator: {
      readonly freezeRawSha256: string;
      readonly planSha256: string;
      readonly artifactsVerified: number;
      readonly artifactInventorySha256: string;
      readonly readOnly: true;
      readonly rerun: false;
    };
    readonly attempt2Comparator: {
      readonly freezeRawSha256: string;
      readonly planSha256: string;
      readonly artifactsVerified: number;
      readonly artifactInventorySha256: string;
      readonly repairArtifactInventory: { readonly count: number; readonly sha256: string };
      readonly readOnly: true;
      readonly rerun: false;
    };
    readonly attempt3Comparator: {
      readonly freezeRawSha256: string;
      readonly planSha256: string;
      readonly artifactsVerified: number;
      readonly artifactInventorySha256: string;
      readonly repairArtifactInventory: { readonly count: number; readonly sha256: string };
      readonly readOnly: true;
      readonly rerun: false;
    };
    readonly corpus: {
      readonly rawSha256: string;
      readonly manifestRawSha256: string;
      readonly contentSha256: string;
      readonly items: number;
      readonly split: 'DEVELOPMENT';
    };
  };
  readonly goldAvailability: GoldAvailability;
  readonly goldSupplement?: {
    readonly supplementPath: string;
    readonly supplementVersion: string;
    readonly supplementRawSha256: string;
    readonly fixturePath: string;
    readonly fixtureRawSha256: string;
    readonly labelCount: number;
    readonly pinnedByF0O: true;
  };
  readonly ownerAdjudication?: {
    readonly recordPath: string;
    readonly recordRawSha256: string;
    readonly goldId: string;
    readonly confirmedVerdict: string;
    readonly labelChanged: false;
    readonly pinnedByF0O: true;
  };
  readonly candidate: CandidateSummary;
  readonly repair: Attempt4RepairSummary;
  /** Post-repair semantic metrics and the frozen gates. Absent on a no-gold derivation. */
  readonly semanticMetrics?: VariantSemanticMetrics;
  readonly gates: readonly GateOutcome[];
  readonly failedGates: readonly string[];
  readonly unmeasuredGates: readonly string[];
  readonly devGateOutcome: DevGateOutcome;
  readonly pageVersusUnitFailures: PageVersusUnitFailures;
  readonly comparisons: readonly ComparatorMovement[];
  readonly perBatchCost: readonly PerBatchCost[];
  readonly holdoutEligibility: {
    readonly holdoutInferencePermittedByThisSummary: false;
    readonly rule: string;
    readonly devCandidatePassesEveryFrozenGate: boolean | null;
  };
  readonly stochasticCaveat: string;
  readonly scope: string;
}

function validityCountsOf(
  rows: readonly ScoredItem[],
  view: 'FIRST_PASS' | 'POST_REPAIR',
): ValidityCounts {
  const stateOf = (
    row: ScoredItem,
  ): { validatorState: string; rejectionCategory: string | null } =>
    view === 'FIRST_PASS' ? (row.firstPass ?? row) : row;
  const accepted = rows.filter((r) => stateOf(r).validatorState === 'ACCEPTED').length;
  const rejectionsByCategory: Record<string, number> = {};
  for (const row of rows) {
    const category = stateOf(row).rejectionCategory;
    if (category !== null)
      rejectionsByCategory[category] = (rejectionsByCategory[category] ?? 0) + 1;
  }
  return {
    accepted,
    rejected: rows.length - accepted,
    rate: rate(accepted, rows.length),
    rejectionsByCategory,
  };
}

function sumOf(
  evaluations: readonly LoadedEvaluation[],
  select: (e: LoadedEvaluation) => number | null,
): number {
  return evaluations.reduce((total, e) => total + (select(e) ?? 0), 0);
}

function comparatorMovementOf(
  comparator:
    'PROMPT_V1_CANONICAL' | 'PROMPT_V2_CANONICAL' | 'PROMPT_V3_CANONICAL' | 'PROMPT_V4_CANONICAL',
  paired: readonly PairedItem[],
): ComparatorMovement {
  return {
    comparator,
    pairs: paired.length,
    validity: countValidityTransitions(paired),
    correctnessByField: GOLD_BACKED_FIELDS.map((field) =>
      countCorrectnessTransitions(paired, field),
    ),
    concordanceByField: CONCORDANCE_FIELD_NAMES.map((field) => countConcordance(paired, field)),
    recoveredByV5: paired
      .filter((p) => p.validityTransition === 'REJECTED_TO_ACCEPTED')
      .map((p) => p.goldId),
    lostByV5: paired
      .filter((p) => p.validityTransition === 'ACCEPTED_TO_REJECTED')
      .map((p) => p.goldId),
    verdictCorrections: paired
      .filter((p) => p.correctnessTransition['verdict'] === 'INCORRECT_TO_CORRECT')
      .map((p) => p.goldId),
    verdictRegressions: paired
      .filter((p) => p.correctnessTransition['verdict'] === 'CORRECT_TO_INCORRECT')
      .map((p) => p.goldId),
  };
}

function pageVersusUnitFailuresOf(rows: readonly ScoredItem[]): PageVersusUnitFailures {
  const goldUnitPage = rows.filter((r) => r.gold['verdict'] === 'UNIT_PAGE');
  const hardNegatives = rows.filter((r) => r.gold['hard_negative'] === 'HARD_NEGATIVE');
  return {
    goldUnitPageAnsweredNotAUnit: goldUnitPage
      .filter((r) => r.prediction?.verdict === 'NOT_A_UNIT')
      .map((r) => r.goldId),
    hardNegativesAnsweredUnitPage: hardNegatives
      .filter((r) => r.prediction?.verdict === 'UNIT_PAGE')
      .map((r) => r.goldId),
    goldUnitPageValidatorRejected: goldUnitPage
      .filter((r) => r.prediction === null)
      .map((r) => r.goldId),
  };
}

export function buildAttempt4Summary(input: {
  readonly attempt4: LoadedAttempt4Sources;
  readonly attempt1Comparator: LoadedSources;
  readonly attempt2Comparator: LoadedAttempt2Sources;
  readonly attempt3Comparator: LoadedAttempt3Sources;
  readonly v5Rows: readonly ScoredItem[];
  readonly pairedV1ToV5: readonly PairedItem[];
  readonly pairedV2ToV5: readonly PairedItem[];
  readonly pairedV3ToV5: readonly PairedItem[];
  readonly pairedV4ToV5: readonly PairedItem[];
  readonly availability: GoldAvailability;
  readonly supplement: LoadedGoldSupplement | null;
  readonly ownerAdjudication: LoadedOwnerAdjudication | null;
}): Attempt4Summary {
  const { attempt4, attempt1Comparator, attempt2Comparator, attempt3Comparator, v5Rows } = input;
  const v5Evaluations = attempt4.evaluations;
  const first = v5Rows[0];
  const rounds = v5Evaluations.flatMap((e) => (e.repairRound === null ? [] : [e.repairRound]));
  const sumRounds = (select: (round: (typeof rounds)[number]) => number): number =>
    rounds.reduce((total, round) => total + select(round), 0);
  const firstPass = validityCountsOf(v5Rows, 'FIRST_PASS');
  const postRepair = validityCountsOf(v5Rows, 'POST_REPAIR');
  const goldIsAvailable = input.availability.fields.some(
    (f) => f.available && f.source === 'F4A_SCORING_SUPPLEMENT',
  );
  const frozenGates: Readonly<Record<string, number>> = Object.fromEntries(
    Object.entries(attempt4.freeze.scoring.gates).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
  const semanticMetrics = goldIsAvailable
    ? semanticMetricsOf('PROMPT_V5_CANONICAL' satisfies ScoredVariantName, v5Rows, frozenGates)
    : null;
  const gates = semanticMetrics?.gates ?? [];
  const failedGates = gates.filter((g) => g.met === false).map((g) => g.gate);
  const unmeasuredGates = gates.filter((g) => g.met === null).map((g) => g.gate);
  const devGateOutcome: DevGateOutcome = !goldIsAvailable
    ? 'INSUFFICIENT_VALID_DEV_EVIDENCE'
    : failedGates.length === 0 && unmeasuredGates.length === 0 && gates.length > 0
      ? 'ALL_FROZEN_GATES_MET_ON_DEV'
      : 'FROZEN_GATES_FAILED_ON_DEV';
  const evaluationByOrdinal = (
    evaluations: readonly LoadedEvaluation[],
    variantName: ScoredVariantName,
    ordinal: number,
  ): LoadedEvaluation | undefined =>
    evaluations.find((e) => e.variantName === variantName && e.logicalBatchOrdinal === ordinal);
  const perBatchCost: PerBatchCost[] = attempt4.plan.evaluations.map((planned) => {
    const v5 = evaluationByOrdinal(
      v5Evaluations,
      'PROMPT_V5_CANONICAL',
      planned.logicalBatchOrdinal,
    );
    const v1 = evaluationByOrdinal(
      attempt1Comparator.evaluations,
      'PROMPT_V1_CANONICAL',
      planned.logicalBatchOrdinal,
    );
    const v2 = evaluationByOrdinal(
      attempt1Comparator.evaluations,
      'PROMPT_V2_CANONICAL',
      planned.logicalBatchOrdinal,
    );
    const v3 = evaluationByOrdinal(
      attempt2Comparator.evaluations,
      'PROMPT_V3_CANONICAL',
      planned.logicalBatchOrdinal,
    );
    const v4 = evaluationByOrdinal(
      attempt3Comparator.evaluations,
      'PROMPT_V4_CANONICAL',
      planned.logicalBatchOrdinal,
    );
    return {
      logicalBatchOrdinal: planned.logicalBatchOrdinal,
      echeRowKey: planned.echeRowKey,
      documents: planned.orderedDocIndices.length,
      v5: {
        wallTimeMs: v5?.wallTimeMs ?? null,
        inputTokens: v5?.inputTokens ?? null,
        outputTokens: v5?.outputTokens ?? null,
        repairWallTimeMs: v5?.repairRound?.monotonicWallTimeMs ?? 0,
        repairExecuted: v5?.repairRound?.executed ?? 0,
      },
      v1: { wallTimeMs: v1?.wallTimeMs ?? null, outputTokens: v1?.outputTokens ?? null },
      v2: { wallTimeMs: v2?.wallTimeMs ?? null, outputTokens: v2?.outputTokens ?? null },
      v3: { wallTimeMs: v3?.wallTimeMs ?? null, outputTokens: v3?.outputTokens ?? null },
      v4: { wallTimeMs: v4?.wallTimeMs ?? null, outputTokens: v4?.outputTokens ?? null },
    };
  });

  return {
    scorerVersion: ATTEMPT4_SCORER_VERSION,
    outputSchemaVersion: ATTEMPT4_OUTPUT_SCHEMA_VERSION,
    attemptNo: 4,
    sources: {
      attempt4: {
        freezeVersion: attempt4.freeze.version,
        freezeRawSha256: attempt4.freezeRawSha256,
        planSha256: attempt4.planSha256,
        artifactsVerified: attempt4.artifactsVerified,
        artifactInventorySha256: attempt4.artifactInventorySha256,
        repairArtifactInventory: attempt4.repairArtifactInventory,
        consumptionMarkerSha256: attempt4.consumptionMarkerSha256,
        authorisationSha256: attempt4.authorisationSha256,
        consumedAtUtc: attempt4.consumedAtUtc,
        experimentStatus: attempt4.experimentStatus,
        experimentCompletedAtUtc: attempt4.experimentCompletedAtUtc,
      },
      attempt1Comparator: {
        freezeRawSha256: attempt1Comparator.freezeRawSha256,
        planSha256: attempt1Comparator.planSha256,
        artifactsVerified: attempt1Comparator.artifactsVerified,
        artifactInventorySha256: attempt1Comparator.artifactInventorySha256,
        readOnly: true,
        rerun: false,
      },
      attempt2Comparator: {
        freezeRawSha256: attempt2Comparator.freezeRawSha256,
        planSha256: attempt2Comparator.planSha256,
        artifactsVerified: attempt2Comparator.artifactsVerified,
        artifactInventorySha256: attempt2Comparator.artifactInventorySha256,
        repairArtifactInventory: attempt2Comparator.repairArtifactInventory,
        readOnly: true,
        rerun: false,
      },
      attempt3Comparator: {
        freezeRawSha256: attempt3Comparator.freezeRawSha256,
        planSha256: attempt3Comparator.planSha256,
        artifactsVerified: attempt3Comparator.artifactsVerified,
        artifactInventorySha256: attempt3Comparator.artifactInventorySha256,
        repairArtifactInventory: attempt3Comparator.repairArtifactInventory,
        readOnly: true,
        rerun: false,
      },
      corpus: {
        rawSha256: attempt4.corpusRawSha256,
        manifestRawSha256: attempt4.corpusManifestRawSha256,
        contentSha256: attempt4.corpusContentSha256,
        items: attempt4.corpusRows.length,
        split: 'DEVELOPMENT',
      },
    },
    goldAvailability: input.availability,
    ...(input.supplement === null
      ? {}
      : {
          goldSupplement: {
            supplementPath: input.supplement.supplementPath,
            supplementVersion: input.supplement.supplementVersion,
            supplementRawSha256: input.supplement.supplementRawSha256,
            fixturePath: input.supplement.fixturePath,
            fixtureRawSha256: input.supplement.fixtureRawSha256,
            labelCount: input.supplement.labelCount,
            pinnedByF0O: true as const,
          },
        }),
    ...(input.ownerAdjudication === null
      ? {}
      : {
          ownerAdjudication: {
            recordPath: input.ownerAdjudication.recordPath,
            recordRawSha256: input.ownerAdjudication.recordRawSha256,
            goldId: input.ownerAdjudication.goldId,
            confirmedVerdict: input.ownerAdjudication.confirmedVerdict,
            labelChanged: false as const,
            pinnedByF0O: true as const,
          },
        }),
    candidate: {
      variantName: 'PROMPT_V5_CANONICAL',
      promptVersion: first?.promptVersion ?? '',
      promptSha256: first?.promptSha256 ?? '',
      variantGitCommit: first?.variantGitCommit ?? '',
      items: v5Rows.length,
      firstPass,
      postRepair,
      recoveredByRepair: postRepair.accepted - firstPass.accepted,
      predictionDistribution: distributionOf(v5Rows),
      inputTokens: sumOf(v5Evaluations, (e) => e.inputTokens),
      outputTokens: sumOf(v5Evaluations, (e) => e.outputTokens),
      wallTimeMs: sumOf(v5Evaluations, (e) => e.wallTimeMs),
    },
    repair: {
      gatesAppliedTo: 'POST_REPAIR_VALIDITY',
      firstPassRateAlwaysReported: true,
      evaluationsWithARound: rounds.length,
      repairs: {
        planned: sumRounds((r) => r.planned),
        executed: sumRounds((r) => r.executed),
        accepted: sumRounds((r) => r.accepted),
        rejected: sumRounds((r) => r.rejected),
        providerFailed: sumRounds((r) => r.providerFailed),
        skipped: sumRounds((r) => r.skipped),
      },
      repairInputTokens: sumRounds((r) => r.inputTokens),
      repairOutputTokens: sumRounds((r) => r.outputTokens),
      repairWallTimeMs: sumRounds((r) => r.monotonicWallTimeMs),
      artifactInventory: attempt4.repairArtifactInventory,
      artifactsVerified: attempt4.repairArtifactsVerified,
      policy: {
        enabled: attempt4.freeze.repairPolicy.enabled,
        minimumRemainingBudgetMs: attempt4.freeze.repairPolicy.minimumRemainingBudgetMs,
      },
    },
    ...(semanticMetrics === null ? {} : { semanticMetrics }),
    gates,
    failedGates,
    unmeasuredGates,
    devGateOutcome,
    pageVersusUnitFailures: pageVersusUnitFailuresOf(v5Rows),
    comparisons: [
      comparatorMovementOf('PROMPT_V1_CANONICAL', input.pairedV1ToV5),
      comparatorMovementOf('PROMPT_V2_CANONICAL', input.pairedV2ToV5),
      comparatorMovementOf('PROMPT_V3_CANONICAL', input.pairedV3ToV5),
      comparatorMovementOf('PROMPT_V4_CANONICAL', input.pairedV4ToV5),
    ],
    perBatchCost,
    holdoutEligibility: {
      holdoutInferencePermittedByThisSummary: false,
      rule: attempt4.freeze.scoring.acceptanceRule,
      devCandidatePassesEveryFrozenGate: goldIsAvailable
        ? devGateOutcome === 'ALL_FROZEN_GATES_MET_ON_DEV'
        : null,
    },
    stochasticCaveat: attempt4.freeze.scoring.comparatorPolicy.stochasticCaveat,
    scope:
      'This summary concerns the DEVELOPMENT split only. It is a report of measured gate outcomes, ' +
      'not an acceptance decision; it authorises no HOLDOUT inference, no merge to main, no further ' +
      'attempt and no production change. HOLDOUT requires a separate owner authorisation.',
  };
}

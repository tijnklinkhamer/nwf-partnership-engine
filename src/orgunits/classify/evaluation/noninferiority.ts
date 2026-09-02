/**
 * MODEL SELECTION SUPERSEDED BY OWNER PRODUCT DECISION on 2026-09-02:
 * PRODUCTION CLASSIFIER = CLAUDE SONNET 5. This module is no longer called
 * by the active protocol (`PHASE_2B_2D_SONNET_ACCEPTANCE_PROTOCOL.md`) -
 * there is no challenger to compare Sonnet against. Retained UNEDITED as
 * historical/background research: a Haiku-vs-Sonnet or Opus-vs-Sonnet
 * comparison built the same way, should one ever be commissioned again as an
 * explicit, separately-approved audit, would reuse these primitives rather
 * than reinvent them.
 *
 * NON-INFERIORITY COMPARISON (protocol s"Haiku-vs-Sonnet rule") - the
 * predefined test of whether the efficiency challenger is MATERIALLY
 * INFERIOR to the reference candidate on a critical metric.
 *
 * The rule, frozen before results: the challenger is materially inferior on
 * a metric when BOTH hold -
 *
 *   1. the gap in the unfavourable direction meets the metric's margin, and
 *   2. the raw error-count difference is at least
 *      `MIN_ABSOLUTE_ERROR_DIFFERENCE` items.
 *
 * The second clause exists because the corpus strata are small: a rate gap
 * carried by a single document is noise, not evidence, and a margin defined
 * only as a proportion would let one page decide a model selection.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { ModelMetrics, Rate } from './metrics.js';
import {
  MIN_ABSOLUTE_ERROR_DIFFERENCE,
  MIN_SUBGROUP_SIZE_FOR_GATING,
  NON_INFERIORITY_MARGINS,
} from './protocol.js';

export interface MetricComparison {
  readonly metric: string;
  readonly margin: number;
  /** true when a LOWER value is better (rate-of-failure metrics). */
  readonly lowerIsBetter: boolean;
  readonly referenceValue: number | null;
  readonly challengerValue: number | null;
  /** Positive when the challenger is worse, in the metric's own direction. */
  readonly unfavourableGap: number | null;
  /** Challenger errors minus reference errors (never below 0 for this test). */
  readonly errorCountDifference: number | null;
  /** null when either side is vacuous (empty denominator) - reported, never guessed. */
  readonly materiallyInferior: boolean | null;
}

export interface NonInferiorityResult {
  readonly comparisons: readonly MetricComparison[];
  /** true when NO comparison found material inferiority (nulls do not count). */
  readonly challengerNonInferior: boolean;
  /** Metrics that could not be compared (vacuous on either side). */
  readonly incomparable: readonly string[];
}

function errorsOf(observed: Rate, lowerIsBetter: boolean): number {
  return lowerIsBetter ? observed.numerator : observed.denominator - observed.numerator;
}

function compareMetric(
  metric: string,
  margin: number,
  lowerIsBetter: boolean,
  reference: Rate,
  challenger: Rate,
): MetricComparison {
  if (reference.value === null || challenger.value === null) {
    return {
      metric,
      margin,
      lowerIsBetter,
      referenceValue: reference.value,
      challengerValue: challenger.value,
      unfavourableGap: null,
      errorCountDifference: null,
      materiallyInferior: null,
    };
  }
  const unfavourableGap = lowerIsBetter
    ? challenger.value - reference.value
    : reference.value - challenger.value;
  const errorCountDifference =
    errorsOf(challenger, lowerIsBetter) - errorsOf(reference, lowerIsBetter);
  return {
    metric,
    margin,
    lowerIsBetter,
    referenceValue: reference.value,
    challengerValue: challenger.value,
    unfavourableGap,
    errorCountDifference,
    materiallyInferior:
      unfavourableGap >= margin && errorCountDifference >= MIN_ABSOLUTE_ERROR_DIFFERENCE,
  };
}

/**
 * Compares the challenger against the reference on every predefined
 * critical metric, including gateable language subgroups present in BOTH
 * models' metrics.
 */
export function compareNonInferiority(
  reference: ModelMetrics,
  challenger: ModelMetrics,
): NonInferiorityResult {
  const comparisons: MetricComparison[] = [
    compareMetric(
      'unit_page_recall',
      NON_INFERIORITY_MARGINS.unitPageRecall,
      false,
      reference.unitPageRecall,
      challenger.unitPageRecall,
    ),
    compareMetric(
      'unit_page_precision',
      NON_INFERIORITY_MARGINS.unitPagePrecision,
      false,
      reference.unitPagePrecision,
      challenger.unitPagePrecision,
    ),
    compareMetric(
      'hard_negative_rejection',
      NON_INFERIORITY_MARGINS.hardNegativeRejection,
      false,
      reference.hardNegativeRejection,
      challenger.hardNegativeRejection,
    ),
    compareMetric(
      'unit_type_accuracy',
      NON_INFERIORITY_MARGINS.unitTypeAccuracy,
      false,
      reference.unitTypeAccuracy,
      challenger.unitTypeAccuracy,
    ),
    compareMetric(
      'unknown_axis_accuracy',
      NON_INFERIORITY_MARGINS.unknownAxisAccuracy,
      false,
      reference.axisAccuracyByGoldValue.UNKNOWN,
      challenger.axisAccuracyByGoldValue.UNKNOWN,
    ),
    compareMetric(
      'false_no_on_gold_unknown_rate',
      NON_INFERIORITY_MARGINS.falseNoOnGoldUnknownRate,
      true,
      reference.falseNoOnGoldUnknownRate,
      challenger.falseNoOnGoldUnknownRate,
    ),
  ];

  for (const referenceSubgroup of reference.languageSubgroups) {
    if (referenceSubgroup.size < MIN_SUBGROUP_SIZE_FOR_GATING) continue;
    const challengerSubgroup = challenger.languageSubgroups.find(
      (s) => s.language === referenceSubgroup.language,
    );
    if (challengerSubgroup === undefined) continue;
    comparisons.push(
      compareMetric(
        `subgroup_${referenceSubgroup.language}_verdict_accuracy`,
        NON_INFERIORITY_MARGINS.perLanguageVerdictAccuracy,
        false,
        referenceSubgroup.verdictAccuracy,
        challengerSubgroup.verdictAccuracy,
      ),
    );
  }

  return {
    comparisons,
    challengerNonInferior: comparisons.every((c) => c.materiallyInferior !== true),
    incomparable: comparisons.filter((c) => c.materiallyInferior === null).map((c) => c.metric),
  };
}

/**
 * METRIC DEFINITIONS AND DENOMINATORS - frozen BEFORE any benchmark runs
 * (protocol s"Absolute hard gates"). Every rate here names its exact
 * numerator and denominator, because the protocol's first rule of scoring
 * is that a rate whose denominator was chosen after the results is not a
 * measurement.
 *
 * OUTCOME TAXONOMY (per attempted document):
 *
 *   - `VALID`            - schema-valid, span-verified result was produced.
 *   - `INVALID`          - the model produced output that failed validation
 *                          (schema, doc_index, length, or evidence
 *                          verification) OR refused. Counts as a FAILURE in
 *                          every quality denominator it belongs to - never
 *                          as a missing observation.
 *   - `USAGE_LIMIT`      - the subscription usage limit interrupted the
 *                          attempt. Excluded from every quality denominator
 *                          (an operational event, not a model answer) and
 *                          reported separately.
 *   - `PROVIDER_FAILURE` - transport/infrastructure failure (transient
 *                          provider error, timeout before any output).
 *                          Excluded from quality denominators, reported as
 *                          the provider failure rate.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { PAGE_KINDS, RELEVANCE_VALUES, UNIT_TYPES } from '../outputSchema.js';
import {
  ABSOLUTE_GATES,
  ERROR_SEVERITY_WEIGHTS,
  MAX_SUBGROUP_SHORTFALL,
  MIN_SUBGROUP_SIZE_FOR_GATING,
} from './protocol.js';
import type { LanguageStratum } from './strata.js';

export type Verdict = 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW';
export type UnitType = (typeof UNIT_TYPES)[number];
export type PageKind = (typeof PAGE_KINDS)[number];
export type RelevanceValue = (typeof RELEVANCE_VALUES)[number];

export type AttemptOutcome = 'VALID' | 'INVALID' | 'USAGE_LIMIT' | 'PROVIDER_FAILURE';

/** The scored slice of one model result (production wire vocabulary). */
export interface ScoredResult {
  readonly verdict: Verdict;
  readonly unit_type: UnitType | null;
  readonly page_kind: PageKind | null;
  readonly serves_incoming_international_students: RelevanceValue | null;
  readonly serves_outgoing_mobility_students: RelevanceValue | null;
  readonly provides_language_learning_or_support: RelevanceValue | null;
}

export interface ModelAttemptRecord {
  readonly goldId: string;
  readonly outcome: AttemptOutcome;
  /** Present exactly when `outcome` is VALID. */
  readonly result: ScoredResult | null;
  /** Any observed tool, MCP, browser or isolation violation in this attempt. */
  readonly isolationViolation: boolean;
}

/** The gold slice metrics need per item. */
export interface GoldItemForScoring {
  readonly goldId: string;
  readonly language: LanguageStratum;
  readonly verdict: Verdict;
  readonly unitType: UnitType | null;
  readonly axes: {
    readonly serves_incoming_international_students: RelevanceValue | null;
    readonly serves_outgoing_mobility_students: RelevanceValue | null;
    readonly provides_language_learning_or_support: RelevanceValue | null;
  };
  readonly hardNegative: boolean;
}

export interface Rate {
  readonly numerator: number;
  readonly denominator: number;
  /** null when the denominator is empty (VACUOUS - reported, never inferred). */
  readonly value: number | null;
}

function rate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

export interface LanguageSubgroupMetrics {
  readonly language: LanguageStratum;
  readonly size: number;
  readonly verdictAccuracy: Rate;
  readonly unitPageRecall: Rate;
  readonly unitPagePrecision: Rate;
}

export interface ModelMetrics {
  readonly attempted: number;
  readonly usageLimitExcluded: number;
  readonly providerFailures: number;
  /** VALID + INVALID - the quality denominator base. */
  readonly scorable: number;
  readonly valid: number;
  readonly invalid: number;
  readonly schemaValidRate: Rate;
  readonly unitPageRecall: Rate;
  readonly unitPagePrecision: Rate;
  readonly unitTypeAccuracy: Rate;
  readonly hardNegativeRejection: Rate;
  readonly needsReviewRate: Rate;
  /** Per gold axis value, over (gold UNIT_PAGE and model UNIT_PAGE) pairs. */
  readonly axisAccuracyByGoldValue: Readonly<Record<RelevanceValue, Rate>>;
  /** Axis instances answered NO where gold is UNKNOWN - the calibration failure. */
  readonly falseNoOnGoldUnknownRate: Rate;
  readonly languageSubgroups: readonly LanguageSubgroupMetrics[];
  readonly severityWeightedErrorScore: number;
  readonly isolationViolations: number;
}

const AXIS_KEYS = [
  'serves_incoming_international_students',
  'serves_outgoing_mobility_students',
  'provides_language_learning_or_support',
] as const;

/**
 * Computes every protocol metric for one model over one scope of gold
 * items. Items with no attempt record are an ERROR - a benchmark must
 * account for every item explicitly, `USAGE_LIMIT` included.
 */
export function computeModelMetrics(
  gold: readonly GoldItemForScoring[],
  records: readonly ModelAttemptRecord[],
): ModelMetrics {
  const recordByGoldId = new Map<string, ModelAttemptRecord>();
  for (const record of records) {
    if (recordByGoldId.has(record.goldId)) {
      throw new Error(`computeModelMetrics: duplicate attempt record for ${record.goldId}`);
    }
    recordByGoldId.set(record.goldId, record);
  }

  let usageLimitExcluded = 0;
  let providerFailures = 0;
  let valid = 0;
  let invalid = 0;
  let isolationViolations = 0;

  interface ScorablePair {
    readonly item: GoldItemForScoring;
    /** null means INVALID output - a failure, never a missing observation. */
    readonly result: ScoredResult | null;
  }
  const scorablePairs: ScorablePair[] = [];

  for (const item of gold) {
    const record = recordByGoldId.get(item.goldId);
    if (record === undefined) {
      throw new Error(`computeModelMetrics: no attempt record for gold item ${item.goldId}`);
    }
    if (record.isolationViolation) isolationViolations += 1;
    switch (record.outcome) {
      case 'USAGE_LIMIT':
        usageLimitExcluded += 1;
        break;
      case 'PROVIDER_FAILURE':
        providerFailures += 1;
        break;
      case 'INVALID':
        invalid += 1;
        scorablePairs.push({ item, result: null });
        break;
      case 'VALID': {
        if (record.result === null) {
          throw new Error(`computeModelMetrics: VALID record without result for ${item.goldId}`);
        }
        valid += 1;
        scorablePairs.push({ item, result: record.result });
        break;
      }
    }
  }

  const scorable = valid + invalid;

  const goldUnitPairs = scorablePairs.filter((p) => p.item.verdict === 'UNIT_PAGE');
  const recalledUnits = goldUnitPairs.filter((p) => p.result?.verdict === 'UNIT_PAGE');
  const predictedUnitPairs = scorablePairs.filter(
    (p) => p.result !== null && p.result.verdict === 'UNIT_PAGE',
  );
  const bothUnitPairs = recalledUnits;

  const hardNegativePairs = scorablePairs.filter((p) => p.item.hardNegative);
  const rejectedHardNegatives = hardNegativePairs.filter(
    (p) => p.result !== null && p.result.verdict !== 'UNIT_PAGE',
  );

  const axisComparisons: { gold: RelevanceValue; predicted: RelevanceValue }[] = [];
  for (const pair of bothUnitPairs) {
    for (const key of AXIS_KEYS) {
      const goldValue = pair.item.axes[key];
      const predictedValue = pair.result === null ? null : pair.result[key];
      if (goldValue !== null && predictedValue !== null) {
        axisComparisons.push({ gold: goldValue, predicted: predictedValue });
      }
    }
  }
  const axisRateFor = (goldValue: RelevanceValue): Rate => {
    const relevant = axisComparisons.filter((c) => c.gold === goldValue);
    return rate(relevant.filter((c) => c.predicted === goldValue).length, relevant.length);
  };
  const goldUnknownAxes = axisComparisons.filter((c) => c.gold === 'UNKNOWN');

  const languages: LanguageStratum[] = ['FR', 'EN', 'OTHER', 'UNDECLARED'];
  const languageSubgroups = languages
    .map((language): LanguageSubgroupMetrics => {
      const pairs = scorablePairs.filter((p) => p.item.language === language);
      const units = pairs.filter((p) => p.item.verdict === 'UNIT_PAGE');
      const predictedUnits = pairs.filter((p) => p.result?.verdict === 'UNIT_PAGE');
      return {
        language,
        size: pairs.length,
        verdictAccuracy: rate(
          pairs.filter((p) => p.result !== null && p.result.verdict === p.item.verdict).length,
          pairs.length,
        ),
        unitPageRecall: rate(
          units.filter((p) => p.result?.verdict === 'UNIT_PAGE').length,
          units.length,
        ),
        unitPagePrecision: rate(
          predictedUnits.filter((p) => p.item.verdict === 'UNIT_PAGE').length,
          predictedUnits.length,
        ),
      };
    })
    .filter((subgroup) => subgroup.size > 0);

  let severity = 0;
  for (const pair of scorablePairs) {
    const predicted = pair.result?.verdict ?? null;
    if (pair.item.verdict === 'UNIT_PAGE') {
      if (predicted === 'NOT_A_UNIT' || predicted === null) {
        severity += ERROR_SEVERITY_WEIGHTS.missedUnitAsNotAUnit;
      } else if (predicted === 'NEEDS_REVIEW') {
        severity += ERROR_SEVERITY_WEIGHTS.missedUnitAsNeedsReview;
      } else if (pair.result !== null && pair.result.unit_type !== pair.item.unitType) {
        severity += ERROR_SEVERITY_WEIGHTS.wrongUnitType;
      }
    } else if (pair.item.verdict === 'NOT_A_UNIT') {
      if (predicted === 'UNIT_PAGE') {
        severity += pair.item.hardNegative
          ? ERROR_SEVERITY_WEIGHTS.falseUnitOnHardNegative
          : ERROR_SEVERITY_WEIGHTS.falseUnitOther;
      } else if (predicted === 'NEEDS_REVIEW') {
        severity += ERROR_SEVERITY_WEIGHTS.unnecessaryNeedsReview;
      }
    }
  }
  severity +=
    goldUnknownAxes.filter((c) => c.predicted === 'NO').length *
    ERROR_SEVERITY_WEIGHTS.falseNoOnGoldUnknown;

  return {
    attempted: gold.length,
    usageLimitExcluded,
    providerFailures,
    scorable,
    valid,
    invalid,
    schemaValidRate: rate(valid, scorable),
    unitPageRecall: rate(recalledUnits.length, goldUnitPairs.length),
    unitPagePrecision: rate(
      predictedUnitPairs.filter((p) => p.item.verdict === 'UNIT_PAGE').length,
      predictedUnitPairs.length,
    ),
    unitTypeAccuracy: rate(
      bothUnitPairs.filter((p) => p.result !== null && p.result.unit_type === p.item.unitType)
        .length,
      bothUnitPairs.length,
    ),
    hardNegativeRejection: rate(rejectedHardNegatives.length, hardNegativePairs.length),
    needsReviewRate: rate(
      scorablePairs.filter((p) => p.result?.verdict === 'NEEDS_REVIEW').length,
      valid,
    ),
    axisAccuracyByGoldValue: {
      YES: axisRateFor('YES'),
      NO: axisRateFor('NO'),
      UNKNOWN: axisRateFor('UNKNOWN'),
    },
    falseNoOnGoldUnknownRate: rate(
      goldUnknownAxes.filter((c) => c.predicted === 'NO').length,
      goldUnknownAxes.length,
    ),
    languageSubgroups,
    severityWeightedErrorScore: severity,
    isolationViolations,
  };
}

export interface GateResult {
  readonly gate: string;
  readonly threshold: number;
  readonly observed: number | null;
  readonly numerator: number;
  readonly denominator: number;
  /** True when the denominator was empty - reported, and treated as passing. */
  readonly vacuous: boolean;
  readonly pass: boolean;
}

export interface GateEvaluation {
  readonly gates: readonly GateResult[];
  readonly allPass: boolean;
}

function minGate(gate: string, threshold: number, observed: Rate): GateResult {
  const vacuous = observed.value === null;
  return {
    gate,
    threshold,
    observed: observed.value,
    numerator: observed.numerator,
    denominator: observed.denominator,
    vacuous,
    pass: vacuous || (observed.value as number) >= threshold,
  };
}

function maxGate(gate: string, threshold: number, observed: Rate): GateResult {
  const vacuous = observed.value === null;
  return {
    gate,
    threshold,
    observed: observed.value,
    numerator: observed.numerator,
    denominator: observed.denominator,
    vacuous,
    pass: vacuous || (observed.value as number) <= threshold,
  };
}

/** Applies every absolute hard gate, including the catastrophic-subgroup rule. */
export function evaluateAbsoluteGates(metrics: ModelMetrics): GateEvaluation {
  const gates: GateResult[] = [
    minGate('schema_valid_rate', ABSOLUTE_GATES.minSchemaValidRate, metrics.schemaValidRate),
    minGate('unit_page_recall', ABSOLUTE_GATES.minUnitPageRecall, metrics.unitPageRecall),
    minGate('unit_page_precision', ABSOLUTE_GATES.minUnitPagePrecision, metrics.unitPagePrecision),
    minGate('unit_type_accuracy', ABSOLUTE_GATES.minUnitTypeAccuracy, metrics.unitTypeAccuracy),
    minGate(
      'hard_negative_rejection',
      ABSOLUTE_GATES.minHardNegativeRejection,
      metrics.hardNegativeRejection,
    ),
    maxGate('needs_review_rate', ABSOLUTE_GATES.maxNeedsReviewRate, metrics.needsReviewRate),
    {
      gate: 'isolation_violations',
      threshold: ABSOLUTE_GATES.maxIsolationViolations,
      observed: metrics.isolationViolations,
      numerator: metrics.isolationViolations,
      denominator: metrics.attempted,
      vacuous: false,
      pass: metrics.isolationViolations <= ABSOLUTE_GATES.maxIsolationViolations,
    },
  ];

  for (const subgroup of metrics.languageSubgroups) {
    if (subgroup.size < MIN_SUBGROUP_SIZE_FOR_GATING) continue;
    gates.push(
      minGate(
        `subgroup_${subgroup.language}_unit_page_recall`,
        ABSOLUTE_GATES.minUnitPageRecall - MAX_SUBGROUP_SHORTFALL,
        subgroup.unitPageRecall,
      ),
      minGate(
        `subgroup_${subgroup.language}_unit_page_precision`,
        ABSOLUTE_GATES.minUnitPagePrecision - MAX_SUBGROUP_SHORTFALL,
        subgroup.unitPagePrecision,
      ),
    );
  }

  return { gates, allPass: gates.every((gateResult) => gateResult.pass) };
}

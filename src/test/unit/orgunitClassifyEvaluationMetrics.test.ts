/**
 * Metric denominators, invalid-output handling, usage-limit exclusion,
 * UNKNOWN calibration, NEEDS_REVIEW accounting, hard gates and the
 * non-inferiority comparison (`evaluation/metrics.ts`,
 * `evaluation/noninferiority.ts`).
 *
 * ZERO model calls - every "result" here is a hand-built record.
 */
import { describe, expect, it } from 'vitest';
import {
  computeModelMetrics,
  evaluateAbsoluteGates,
  type GoldItemForScoring,
  type ModelAttemptRecord,
  type ScoredResult,
} from '../../orgunits/classify/evaluation/metrics.js';
import { compareNonInferiority } from '../../orgunits/classify/evaluation/noninferiority.js';
import {
  MIN_ABSOLUTE_ERROR_DIFFERENCE,
  NON_INFERIORITY_MARGINS,
} from '../../orgunits/classify/evaluation/protocol.js';

function goldUnit(goldId: string, overrides?: Partial<GoldItemForScoring>): GoldItemForScoring {
  return {
    goldId,
    language: 'FR',
    verdict: 'UNIT_PAGE',
    unitType: 'INTERNATIONAL_MOBILITY_OFFICE',
    axes: {
      serves_incoming_international_students: 'YES',
      serves_outgoing_mobility_students: 'UNKNOWN',
      provides_language_learning_or_support: 'UNKNOWN',
    },
    hardNegative: false,
    ...overrides,
  };
}

function goldNegative(goldId: string, hardNegative = false): GoldItemForScoring {
  return {
    goldId,
    language: 'FR',
    verdict: 'NOT_A_UNIT',
    unitType: null,
    axes: {
      serves_incoming_international_students: null,
      serves_outgoing_mobility_students: null,
      provides_language_learning_or_support: null,
    },
    hardNegative,
  };
}

function unitResult(overrides?: Partial<ScoredResult>): ScoredResult {
  return {
    verdict: 'UNIT_PAGE',
    unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
    page_kind: null,
    serves_incoming_international_students: 'YES',
    serves_outgoing_mobility_students: 'UNKNOWN',
    provides_language_learning_or_support: 'UNKNOWN',
    ...overrides,
  };
}

const notAUnitResult: ScoredResult = {
  verdict: 'NOT_A_UNIT',
  unit_type: null,
  page_kind: 'NEWS_OR_EVENT_PAGE',
  serves_incoming_international_students: null,
  serves_outgoing_mobility_students: null,
  provides_language_learning_or_support: null,
};

function valid(goldId: string, result: ScoredResult): ModelAttemptRecord {
  return { goldId, outcome: 'VALID', result, isolationViolation: false };
}

describe('computeModelMetrics denominators', () => {
  it('excludes usage-limit and provider failures from every quality denominator, keeps INVALID as failure', () => {
    const gold = [goldUnit('g1'), goldUnit('g2'), goldNegative('g3'), goldNegative('g4')];
    const records: ModelAttemptRecord[] = [
      valid('g1', unitResult()),
      { goldId: 'g2', outcome: 'INVALID', result: null, isolationViolation: false },
      { goldId: 'g3', outcome: 'USAGE_LIMIT', result: null, isolationViolation: false },
      { goldId: 'g4', outcome: 'PROVIDER_FAILURE', result: null, isolationViolation: false },
    ];
    const metrics = computeModelMetrics(gold, records);
    expect(metrics.attempted).toBe(4);
    expect(metrics.usageLimitExcluded).toBe(1);
    expect(metrics.providerFailures).toBe(1);
    expect(metrics.scorable).toBe(2);
    expect(metrics.schemaValidRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    // g2 is a gold unit with INVALID output: counted as a MISS, not dropped.
    expect(metrics.unitPageRecall).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it('refuses an unaccounted-for gold item and duplicate records', () => {
    expect(() => computeModelMetrics([goldUnit('g1')], [])).toThrow(/no attempt record/);
    expect(() =>
      computeModelMetrics([goldUnit('g1')], [valid('g1', unitResult()), valid('g1', unitResult())]),
    ).toThrow(/duplicate attempt record/);
  });

  it('computes precision over model predictions and unit_type accuracy over agreed unit pages', () => {
    const gold = [
      goldUnit('g1'),
      goldUnit('g2', { unitType: 'LANGUAGE_CENTRE' }),
      goldNegative('g3'),
    ];
    const metrics = computeModelMetrics(gold, [
      valid('g1', unitResult()),
      valid('g2', unitResult()), // wrong type: predicts OFFICE where gold is CENTRE
      valid('g3', unitResult()), // false positive
    ]);
    expect(metrics.unitPagePrecision).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
    expect(metrics.unitTypeAccuracy).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it('counts NEEDS_REVIEW over valid results and rejection of hard negatives including NEEDS_REVIEW', () => {
    const needsReview: ScoredResult = {
      verdict: 'NEEDS_REVIEW',
      unit_type: null,
      page_kind: null,
      serves_incoming_international_students: null,
      serves_outgoing_mobility_students: null,
      provides_language_learning_or_support: null,
    };
    const gold = [goldNegative('g1', true), goldNegative('g2', true), goldNegative('g3', true)];
    const metrics = computeModelMetrics(gold, [
      valid('g1', notAUnitResult),
      valid('g2', needsReview),
      valid('g3', unitResult()),
    ]);
    expect(metrics.hardNegativeRejection).toEqual({ numerator: 2, denominator: 3, value: 2 / 3 });
    expect(metrics.needsReviewRate).toEqual({ numerator: 1, denominator: 3, value: 1 / 3 });
  });

  it('measures UNKNOWN calibration: axis accuracy by gold value and the false-NO rate', () => {
    const gold = [goldUnit('g1')]; // axes: YES, UNKNOWN, UNKNOWN
    const metrics = computeModelMetrics(gold, [
      valid(
        'g1',
        unitResult({
          serves_incoming_international_students: 'YES',
          serves_outgoing_mobility_students: 'NO', // false NO on gold UNKNOWN
          provides_language_learning_or_support: 'UNKNOWN',
        }),
      ),
    ]);
    expect(metrics.axisAccuracyByGoldValue.YES).toEqual({ numerator: 1, denominator: 1, value: 1 });
    expect(metrics.axisAccuracyByGoldValue.UNKNOWN).toEqual({
      numerator: 1,
      denominator: 2,
      value: 0.5,
    });
    expect(metrics.falseNoOnGoldUnknownRate).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
  });

  it('reports language subgroups only for languages present', () => {
    const gold = [goldUnit('g1'), goldUnit('g2', { language: 'EN' })];
    const metrics = computeModelMetrics(gold, [
      valid('g1', unitResult()),
      valid('g2', notAUnitResult),
    ]);
    expect(metrics.languageSubgroups.map((s) => s.language).sort()).toEqual(['EN', 'FR']);
    const en = metrics.languageSubgroups.find((s) => s.language === 'EN');
    expect(en?.unitPageRecall).toEqual({ numerator: 0, denominator: 1, value: 0 });
  });
});

describe('absolute gates', () => {
  it('passes a perfect model and reports vacuous gates as vacuous', () => {
    const gold = [goldUnit('g1'), goldNegative('g2')]; // no hard negatives -> vacuous gate
    const metrics = computeModelMetrics(gold, [
      valid('g1', unitResult()),
      valid('g2', notAUnitResult),
    ]);
    const evaluation = evaluateAbsoluteGates(metrics);
    expect(evaluation.allPass).toBe(true);
    const hardNegativeGate = evaluation.gates.find((g) => g.gate === 'hard_negative_rejection');
    expect(hardNegativeGate?.vacuous).toBe(true);
  });

  it('fails on isolation violations and on a missed recall gate', () => {
    const gold = [goldUnit('g1')];
    const metrics = computeModelMetrics(gold, [
      { goldId: 'g1', outcome: 'VALID', result: notAUnitResult, isolationViolation: true },
    ]);
    const evaluation = evaluateAbsoluteGates(metrics);
    expect(evaluation.allPass).toBe(false);
    expect(evaluation.gates.find((g) => g.gate === 'isolation_violations')?.pass).toBe(false);
    expect(evaluation.gates.find((g) => g.gate === 'unit_page_recall')?.pass).toBe(false);
  });

  it('adds subgroup gates only at or above the gating size', () => {
    const gold = Array.from({ length: 20 }, (_, i) => goldUnit(`g${i}`));
    const metrics = computeModelMetrics(
      gold,
      gold.map((item) => valid(item.goldId, unitResult())),
    );
    const evaluation = evaluateAbsoluteGates(metrics);
    expect(evaluation.gates.some((g) => g.gate === 'subgroup_FR_unit_page_recall')).toBe(true);
  });
});

describe('non-inferiority comparison', () => {
  it('requires BOTH the margin and the minimum absolute error difference', () => {
    // Reference: 20/20 recall. Challenger: 19/20 (one item) - gap 0.05 meets the
    // margin but the error-count difference (1) is below the minimum, so NOT
    // materially inferior.
    const gold = Array.from({ length: 20 }, (_, i) => goldUnit(`g${i}`));
    const reference = computeModelMetrics(
      gold,
      gold.map((item) => valid(item.goldId, unitResult())),
    );
    const oneMiss = computeModelMetrics(
      gold,
      gold.map((item, index) => valid(item.goldId, index === 0 ? notAUnitResult : unitResult())),
    );
    const single = compareNonInferiority(reference, oneMiss);
    const recall = single.comparisons.find((c) => c.metric === 'unit_page_recall');
    expect(recall?.unfavourableGap).toBeCloseTo(0.05);
    expect(recall?.errorCountDifference).toBe(1);
    expect(recall?.materiallyInferior).toBe(false);
    expect(MIN_ABSOLUTE_ERROR_DIFFERENCE).toBe(2);

    const twoMisses = computeModelMetrics(
      gold,
      gold.map((item, index) => valid(item.goldId, index < 2 ? notAUnitResult : unitResult())),
    );
    const double = compareNonInferiority(reference, twoMisses);
    const recall2 = double.comparisons.find((c) => c.metric === 'unit_page_recall');
    expect(recall2?.unfavourableGap).toBeCloseTo(0.1);
    expect(recall2?.errorCountDifference).toBe(2);
    expect(recall2?.materiallyInferior).toBe(0.1 >= NON_INFERIORITY_MARGINS.unitPageRecall);
    expect(double.challengerNonInferior).toBe(false);
  });

  it('treats lower-is-better metrics in the right direction and reports incomparable metrics', () => {
    const gold = [goldNegative('g1')];
    const reference = computeModelMetrics(gold, [valid('g1', notAUnitResult)]);
    const challenger = computeModelMetrics(gold, [valid('g1', notAUnitResult)]);
    const result = compareNonInferiority(reference, challenger);
    // No gold UNIT_PAGE at all: recall and axis metrics are vacuous -> incomparable.
    expect(result.incomparable).toContain('unit_page_recall');
    expect(result.incomparable).toContain('false_no_on_gold_unknown_rate');
    expect(result.challengerNonInferior).toBe(true);
  });
});

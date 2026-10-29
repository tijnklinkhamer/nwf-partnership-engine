/**
 * PHASE 2B-2D2C-V3D1 — EXACT GATE ARITHMETIC AGAINST THE FROZEN THRESHOLDS.
 *
 * The thresholds are read from the committed F0B freeze; the counts from the
 * committed census. Every counterfactual below is ARITHMETIC over counts and
 * predicts nothing about a prompt.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMITTED_ADJUDICATED_RESULTS_DIR } from '../harness/phase2b2d2c/scoring/generate.js';
import { buildFailureCensus, parseScoredItemsJsonl } from '../harness/phase2b2d2c/v3d1/census.js';
import {
  allGatesMet,
  applyCounterfactual,
  evaluateGates,
  failedGates,
  leaveOneOutUnitPage,
  maximumAdditionalFalsePositives,
  type GateCounts,
  type GateThresholds,
} from '../harness/phase2b2d2c/v3d1/gates.js';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const freeze = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'docs/evaluation/PHASE_2B_2D2C_DEV_CONFIGURATION_FREEZE_V1.json'),
    'utf8',
  ),
) as { scoring: { gates: Record<string, number> } };
const thresholds: GateThresholds = {
  minSchemaValidSpanVerifiedRate: freeze.scoring.gates['minSchemaValidSpanVerifiedRate']!,
  minUnitPageRecall: freeze.scoring.gates['minUnitPageRecall']!,
  minUnitPagePrecision: freeze.scoring.gates['minUnitPagePrecision']!,
  minUnitTypeAccuracy: freeze.scoring.gates['minUnitTypeAccuracy']!,
  minHardNegativeRejection: freeze.scoring.gates['minHardNegativeRejection']!,
  maxNeedsReviewRate: freeze.scoring.gates['maxNeedsReviewRate']!,
};
const census = buildFailureCensus(
  parseScoredItemsJsonl(
    readFileSync(join(REPO_ROOT, COMMITTED_ADJUDICATED_RESULTS_DIR, 'scored-items.jsonl'), 'utf8'),
  ),
);
const v1: GateCounts = census.reconciliation.v1;
const v2: GateCounts = census.reconciliation.v2;

const by = (gates: ReturnType<typeof evaluateGates>, name: string) =>
  gates.find((g) => g.gate === name)!;

describe('the frozen thresholds are exactly the ones this analysis reads', () => {
  it('reads F0B values, not invented ones', () => {
    expect(thresholds).toEqual({
      minSchemaValidSpanVerifiedRate: 0.99,
      minUnitPageRecall: 0.95,
      minUnitPagePrecision: 0.9,
      minUnitTypeAccuracy: 0.85,
      minHardNegativeRejection: 0.9,
      maxNeedsReviewRate: 0.15,
    });
  });
});

describe('observed gate arithmetic', () => {
  it('V2 today: 47/49, 9/14, 9/10, 9/14, 21/21, 0/49 — fails span rate, recall and type accuracy', () => {
    const gates = evaluateGates(v2, thresholds);
    expect(by(gates, 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      numerator: 47,
      denominator: 49,
      met: false,
      boundaryNumerator: 49,
      correctionsRequired: 2,
    });
    expect(by(gates, 'minUnitPageRecall')).toMatchObject({
      numerator: 9,
      denominator: 14,
      met: false,
      boundaryNumerator: 14,
      correctionsRequired: 5,
    });
    expect(by(gates, 'minUnitPagePrecision')).toMatchObject({
      numerator: 9,
      denominator: 10,
      met: true,
      boundaryNumerator: 9,
      headroom: 0,
    });
    expect(by(gates, 'minUnitTypeAccuracy')).toMatchObject({
      numerator: 9,
      denominator: 14,
      met: false,
      boundaryNumerator: 12,
      correctionsRequired: 3,
    });
    expect(by(gates, 'minHardNegativeRejection')).toMatchObject({
      numerator: 21,
      denominator: 21,
      met: true,
      boundaryNumerator: 19,
      headroom: 2,
    });
    expect(by(gates, 'maxNeedsReviewRate')).toMatchObject({
      numerator: 0,
      denominator: 49,
      met: true,
      boundaryNumerator: 7,
      headroom: 7,
    });
    expect(failedGates(gates)).toEqual([
      'minSchemaValidSpanVerifiedRate',
      'minUnitPageRecall',
      'minUnitTypeAccuracy',
    ]);
  });

  it('V1 today: 45/49, 12/14, 12/17, 12/14, 16/21, 1/49 — fails span rate, recall, precision and hard-negative rejection', () => {
    const gates = evaluateGates(v1, thresholds);
    expect(by(gates, 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      numerator: 45,
      correctionsRequired: 4,
    });
    expect(by(gates, 'minUnitPageRecall')).toMatchObject({ numerator: 12, correctionsRequired: 2 });
    expect(by(gates, 'minUnitPagePrecision')).toMatchObject({
      numerator: 12,
      denominator: 17,
      met: false,
    });
    expect(by(gates, 'minUnitTypeAccuracy')).toMatchObject({
      numerator: 12,
      met: true,
      headroom: 0,
    });
    expect(by(gates, 'minHardNegativeRejection')).toMatchObject({
      numerator: 16,
      met: false,
      correctionsRequired: 3,
    });
    expect(failedGates(gates)).toEqual([
      'minSchemaValidSpanVerifiedRate',
      'minUnitPageRecall',
      'minUnitPagePrecision',
      'minHardNegativeRejection',
    ]);
  });

  it('at these denominators the span-rate gate needs 49/49 and the recall gate needs 14/14: a single miss fails either', () => {
    expect(
      by(evaluateGates(v2, thresholds), 'minSchemaValidSpanVerifiedRate').boundaryNumerator,
    ).toBe(49);
    expect(by(evaluateGates(v2, thresholds), 'minUnitPageRecall').boundaryNumerator).toBe(14);
  });
});

describe('deterministic counterfactuals over V2 counts (arithmetic, not prediction)', () => {
  it('correcting only the three lost unit pages is NOT sufficient: recall 12/14 and span rate 47/49 still fail', () => {
    const gates = evaluateGates(
      applyCounterfactual(v2, { recoverAnsweredUnitMisses: 3 }),
      thresholds,
    );
    expect(by(gates, 'minUnitPageRecall')).toMatchObject({
      numerator: 12,
      denominator: 14,
      met: false,
    });
    expect(by(gates, 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      numerator: 47,
      met: false,
    });
    expect(by(gates, 'minUnitTypeAccuracy')).toMatchObject({ numerator: 12, met: true });
    expect(failedGates(gates)).toEqual(['minSchemaValidSpanVerifiedRate', 'minUnitPageRecall']);
  });

  it('correcting only the two validator rejections is NOT sufficient: span rate passes at 49/49 but recall is 11/14', () => {
    const gates = evaluateGates(
      applyCounterfactual(v2, { recoverRejectedUnitPages: 2 }),
      thresholds,
    );
    expect(by(gates, 'minSchemaValidSpanVerifiedRate')).toMatchObject({ numerator: 49, met: true });
    expect(by(gates, 'minUnitPageRecall')).toMatchObject({ numerator: 11, met: false });
    expect(failedGates(gates)).toEqual(['minUnitPageRecall', 'minUnitTypeAccuracy']);
  });

  it('correcting both classes — all five gold UNIT_PAGE misses — meets every gate, with precision at 14/15', () => {
    const counts = applyCounterfactual(v2, {
      recoverAnsweredUnitMisses: 3,
      recoverRejectedUnitPages: 2,
    });
    const gates = evaluateGates(counts, thresholds);
    expect(allGatesMet(gates)).toBe(true);
    expect(by(gates, 'minUnitPagePrecision')).toMatchObject({ numerator: 14, denominator: 15 });
    expect(by(gates, 'minUnitPageRecall')).toMatchObject({
      numerator: 14,
      denominator: 14,
      headroom: 0,
    });
    expect(by(gates, 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      numerator: 49,
      headroom: 0,
    });
  });

  it('after both corrections the precision gate tolerates NO additional false positive: 14/15 passes, 14/16 fails', () => {
    const counts = applyCounterfactual(v2, {
      recoverAnsweredUnitMisses: 3,
      recoverRejectedUnitPages: 2,
    });
    expect(maximumAdditionalFalsePositives(counts, thresholds.minUnitPagePrecision)).toBe(0);
    const oneFlip = evaluateGates(
      applyCounterfactual(counts, { additionalFalsePositives: 1 }),
      thresholds,
    );
    expect(by(oneFlip, 'minUnitPagePrecision')).toMatchObject({
      numerator: 14,
      denominator: 16,
      met: false,
    });
  });

  it('the one existing false positive (a gold NEEDS_REVIEW item answered UNIT_PAGE) is what consumes the tolerance: without it, exactly one new false positive would be tolerated', () => {
    const counts = applyCounterfactual(v2, {
      recoverAnsweredUnitMisses: 3,
      recoverRejectedUnitPages: 2,
    });
    const withoutExistingFalsePositive: GateCounts = {
      ...counts,
      unitPagePredicted: counts.unitPagePredicted - 1,
    };
    expect(
      maximumAdditionalFalsePositives(
        withoutExistingFalsePositive,
        thresholds.minUnitPagePrecision,
      ),
    ).toBe(1);
  });

  it('every one of the five misses is individually gate-binding: leaving any single one uncorrected fails recall', () => {
    for (const scenario of [
      { recoverAnsweredUnitMisses: 2, recoverRejectedUnitPages: 2 },
      { recoverAnsweredUnitMisses: 3, recoverRejectedUnitPages: 1 },
    ]) {
      const gates = evaluateGates(applyCounterfactual(v2, scenario), thresholds);
      expect(by(gates, 'minUnitPageRecall').met).toBe(false);
    }
  });

  it('the owner-confirmed item is gate-binding on its own: correcting the other four leaves recall at 13/14', () => {
    const gates = evaluateGates(
      applyCounterfactual(v2, { recoverAnsweredUnitMisses: 2, recoverRejectedUnitPages: 2 }),
      thresholds,
    );
    expect(by(gates, 'minUnitPageRecall')).toMatchObject({
      numerator: 13,
      denominator: 14,
      met: false,
    });
  });

  it('leave-one-out on the owner-confirmed item (V2 view): recall 9/13 needs 13/13, so four corrections would still be required', () => {
    const loo = leaveOneOutUnitPage(v2, {
      accepted: true,
      recalled: false,
      unitTypeCorrect: false,
      answeredNeedsReview: false,
    });
    const gates = evaluateGates(loo, thresholds);
    expect(by(gates, 'minUnitPageRecall')).toMatchObject({
      numerator: 9,
      denominator: 13,
      boundaryNumerator: 13,
      correctionsRequired: 4,
    });
    expect(by(gates, 'minSchemaValidSpanVerifiedRate')).toMatchObject({
      numerator: 46,
      denominator: 48,
      boundaryNumerator: 48,
    });
  });

  it('leave-one-out on the owner-confirmed item (V1 view) reproduces the G2 flip: type accuracy 11/13 not met', () => {
    const loo = leaveOneOutUnitPage(v1, {
      accepted: true,
      recalled: true,
      unitTypeCorrect: true,
      answeredNeedsReview: false,
    });
    expect(by(evaluateGates(loo, thresholds), 'minUnitTypeAccuracy')).toMatchObject({
      numerator: 11,
      denominator: 13,
      met: false,
    });
    expect(by(evaluateGates(v1, thresholds), 'minUnitTypeAccuracy').met).toBe(true);
  });

  it('refuses impossible counterfactuals', () => {
    expect(() => applyCounterfactual(v2, { recoverAnsweredUnitMisses: 6 })).toThrow(RangeError);
    expect(() => applyCounterfactual(v2, { recoverRejectedUnitPages: 3 })).toThrow(RangeError);
    expect(() => applyCounterfactual(v2, { additionalFalsePositives: -1 })).toThrow(RangeError);
  });
});

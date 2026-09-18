/**
 * PHASE 2B-2D ACCEPTANCE METHODOLOGY V2 - the pure statistical primitives.
 *
 * These tests pin the arithmetic the methodology proposal rests on, so a
 * reviewer can check the load-bearing claims rather than trust them. In
 * particular they pin, as executable facts:
 *
 *   - `minUnitPageRecall >= 0.95` over 14 items tolerates ZERO errors;
 *   - 14/14 certifies only 0.8074, not 0.95;
 *   - certifying 0.95 with a flawless run needs 59 items, and 0.99 needs 299;
 *   - a `pass every one of 5 replicates` rule rejects a candidate whose true
 *     recall is exactly 0.95 about 97 times in 100.
 *
 * ZERO PROVIDER, ZERO NETWORK, ZERO DATABASE, ZERO GOLD, ZERO HOLDOUT. Every
 * number below is arithmetic over integers, not a model result.
 */
import { describe, expect, it } from 'vitest';
import {
  clopperPearsonLowerBound,
  clusterBootstrapLowerBound,
  DEFAULT_ALPHA,
  gateFeasibility,
  maxErrorsUnderPointThreshold,
  minimumTrialsToCertify,
  passEveryReplicateAcceptanceProbability,
  replicateDispersion,
  requiredPerReplicatePass,
} from '../../orgunits/classify/evaluation/acceptanceStatistics.js';

describe('clopperPearsonLowerBound', () => {
  it('uses the exact closed form when every trial succeeded', () => {
    // k === n has the closed form alpha ** (1 / n).
    expect(clopperPearsonLowerBound(14, 14)).toBeCloseTo(Math.pow(0.05, 1 / 14), 12);
    expect(clopperPearsonLowerBound(14, 14)).toBeCloseTo(0.8074, 4);
    expect(clopperPearsonLowerBound(49, 49)).toBeCloseTo(0.9407, 4);
    expect(clopperPearsonLowerBound(21, 21)).toBeCloseTo(0.8671, 4);
  });

  it('agrees with the textbook one-sided bound away from the boundary', () => {
    expect(clopperPearsonLowerBound(9, 10)).toBeCloseTo(0.605837, 6);
    expect(clopperPearsonLowerBound(8, 10)).toBeCloseTo(0.493099, 6);
    expect(clopperPearsonLowerBound(80, 100)).toBeCloseTo(0.7228, 6);
  });

  it('satisfies the DEFINING property, checked by direct binomial summation', () => {
    // The bound is defined by P(X >= k | n, bound) === alpha. Verifying that
    // identity with an independent implementation (a plain pmf sum, no beta
    // function) checks the continued-fraction code rather than restating it.
    const logChoose = (n: number, k: number): number => {
      let total = 0;
      for (let i = 1; i <= k; i += 1) total += Math.log(n - k + i) - Math.log(i);
      return total;
    };
    const tailAtLeast = (k: number, n: number, p: number): number => {
      let total = 0;
      for (let i = k; i <= n; i += 1) {
        total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
      }
      return total;
    };
    for (const [k, n] of [
      [9, 10],
      [8, 10],
      [11, 14],
      [12, 14],
      [19, 21],
      [42, 48],
      [80, 100],
    ] as const) {
      expect(tailAtLeast(k, n, clopperPearsonLowerBound(k, n))).toBeCloseTo(DEFAULT_ALPHA, 9);
    }
  });

  it('is zero when nothing succeeded, and monotone in successes', () => {
    expect(clopperPearsonLowerBound(0, 20)).toBe(0);
    let previous = -1;
    for (let k = 0; k <= 20; k += 1) {
      const bound = clopperPearsonLowerBound(k, 20);
      expect(bound).toBeGreaterThan(previous);
      previous = bound;
    }
  });

  it('is monotone in the confidence level and never exceeds the point estimate', () => {
    expect(clopperPearsonLowerBound(12, 14, 0.01)).toBeLessThan(
      clopperPearsonLowerBound(12, 14, 0.1),
    );
    for (const [k, n] of [
      [11, 14],
      [12, 14],
      [14, 14],
      [19, 21],
    ] as const) {
      expect(clopperPearsonLowerBound(k, n)).toBeLessThanOrEqual(k / n);
    }
  });

  it('refuses an undefined or malformed request rather than inventing a bound', () => {
    expect(() => clopperPearsonLowerBound(1, 0)).toThrow(/zero trials/i);
    expect(() => clopperPearsonLowerBound(5, 4)).toThrow(/cannot exceed/i);
    expect(() => clopperPearsonLowerBound(1, 10, 0)).toThrow(/alpha/i);
    expect(() => clopperPearsonLowerBound(1.5, 10)).toThrow(/integer/i);
  });
});

describe('maxErrorsUnderPointThreshold - the gates that only look tolerant', () => {
  it('shows the frozen 0.95 recall gate is a ZERO-MISS gate at 14 items', () => {
    expect(maxErrorsUnderPointThreshold(0.95, 14)).toBe(0);
    // 13/14 = 0.9286 really is below 0.95, so this is arithmetic, not opinion.
    expect(13 / 14).toBeLessThan(0.95);
  });

  it('shows the frozen 0.99 schema gate is a ZERO-FAILURE gate at 49 items', () => {
    expect(maxErrorsUnderPointThreshold(0.99, 49)).toBe(0);
    expect(48 / 49).toBeLessThan(0.99);
  });

  it('reports the real tolerance of the remaining frozen gates', () => {
    expect(maxErrorsUnderPointThreshold(0.85, 14)).toBe(2); // unit_type
    expect(maxErrorsUnderPointThreshold(0.9, 21)).toBe(2); // hard-negative rejection
    expect(maxErrorsUnderPointThreshold(0.9, 15)).toBe(1); // precision, as measured in F6
    expect(maxErrorsUnderPointThreshold(0.9, 12)).toBe(1);
  });
});

describe('minimumTrialsToCertify', () => {
  it('reports the corpus size each frozen threshold needs for a flawless run', () => {
    expect(minimumTrialsToCertify(0.99)).toBe(299);
    expect(minimumTrialsToCertify(0.95)).toBe(59);
    expect(minimumTrialsToCertify(0.9)).toBe(29);
    expect(minimumTrialsToCertify(0.85)).toBe(19);
  });

  it('reports how much error headroom costs', () => {
    expect(minimumTrialsToCertify(0.95, 1)).toBe(93);
    expect(minimumTrialsToCertify(0.95, 2)).toBe(124);
    expect(minimumTrialsToCertify(0.9, 1)).toBe(46);
    expect(minimumTrialsToCertify(0.9, 2)).toBe(61);
  });

  it('returns a denominator that actually certifies, and one below it that does not', () => {
    for (const threshold of [0.99, 0.95, 0.9, 0.85]) {
      const n = minimumTrialsToCertify(threshold)!;
      expect(clopperPearsonLowerBound(n, n)).toBeGreaterThanOrEqual(threshold);
      expect(clopperPearsonLowerBound(n - 1, n - 1)).toBeLessThan(threshold);
    }
  });

  it('reports not-attainable rather than truncating when the ceiling is too low', () => {
    expect(minimumTrialsToCertify(0.95, 0, DEFAULT_ALPHA, 10)).toBeNull();
  });
});

describe('gateFeasibility - no currently-frozen gate is certifiable on DEV', () => {
  // (gate, threshold, DEV denominator) exactly as the F6 study measured them.
  const FROZEN_DEV_GATES = [
    ['minSchemaValidSpanVerifiedRate', 0.99, 49],
    ['minUnitPageRecall', 0.95, 14],
    ['minUnitPagePrecision', 0.9, 15],
    ['minUnitTypeAccuracy', 0.85, 14],
    ['minHardNegativeRejection', 0.9, 21],
  ] as const;

  it.each(FROZEN_DEV_GATES)(
    '%s cannot be established at its own DEV denominator even by a flawless candidate',
    (_gate, threshold, denominator) => {
      const feasibility = gateFeasibility(threshold, denominator);
      expect(feasibility.certifiableAtThisDenominator).toBe(false);
      expect(feasibility.bestAttainableLowerBound).toBeLessThan(threshold);
      expect(feasibility.additionalTrialsRequired).toBeGreaterThan(0);
    },
  );

  it('reports the exact shortfall for the recall gate', () => {
    const feasibility = gateFeasibility(0.95, 14);
    expect(feasibility.pointEstimateIsZeroTolerance).toBe(true);
    expect(feasibility.bestAttainableLowerBound).toBeCloseTo(0.8074, 4);
    expect(feasibility.minimumTrialsForZeroErrorCertification).toBe(59);
    expect(feasibility.additionalTrialsRequired).toBe(45);
  });

  it('confirms a sufficiently large denominator IS certifiable, so the check is not vacuous', () => {
    expect(gateFeasibility(0.95, 59).certifiableAtThisDenominator).toBe(true);
    expect(gateFeasibility(0.9, 29).certifiableAtThisDenominator).toBe(true);
    expect(gateFeasibility(0.85, 19).certifiableAtThisDenominator).toBe(true);
  });
});

describe('pass-every-replicate stringency', () => {
  it('rejects a candidate that exactly meets the nominal recall threshold', () => {
    // True per-item recall 0.95, a zero-miss gate over 14 items, 5 replicates.
    const perReplicate = Math.pow(0.95, 14);
    expect(perReplicate).toBeCloseTo(0.4877, 4);
    const accepted = passEveryReplicateAcceptanceProbability(perReplicate, 5);
    expect(accepted).toBeCloseTo(0.0276, 4);
    expect(accepted).toBeLessThan(0.05);
  });

  it('quantifies how near-perfect a candidate must be to clear the rule', () => {
    expect(requiredPerReplicatePass(0.8, 5)).toBeCloseTo(0.9564, 4);
    expect(requiredPerReplicatePass(0.9, 5)).toBeCloseTo(0.9791, 4);
    // 70 consecutive correct recalls (5 replicates x 14 items) at 80% study success.
    expect(Math.pow(0.8, 1 / 70)).toBeCloseTo(0.99682, 5);
  });

  it('is exactly p ** n and degenerate at the boundaries', () => {
    expect(passEveryReplicateAcceptanceProbability(1, 5)).toBe(1);
    expect(passEveryReplicateAcceptanceProbability(0, 5)).toBe(0);
    expect(passEveryReplicateAcceptanceProbability(0.9, 1)).toBeCloseTo(0.9, 12);
  });
});

describe('replicateDispersion', () => {
  it('summarises the measured F6 recall numerators without inferring from them', () => {
    const dispersion = replicateDispersion([11, 12, 14, 14, 14].map((n) => n / 14));
    expect(dispersion.replicates).toBe(5);
    expect(dispersion.minimum).toBeCloseTo(11 / 14, 12);
    expect(dispersion.maximum).toBe(1);
    expect(dispersion.range).toBeCloseTo(3 / 14, 12);
    expect(dispersion.mean).toBeCloseTo(65 / 70, 12);
  });

  it('refuses an empty replicate set and a non-finite value', () => {
    expect(() => replicateDispersion([])).toThrow(/zero replicates/i);
    expect(() => replicateDispersion([0.5, Number.NaN])).toThrow(/finite/i);
  });
});

describe('clusterBootstrapLowerBound', () => {
  const clustersOf = (perCluster: readonly number[][]): { clusterId: string; values: number[] }[] =>
    perCluster.map((values, index) => ({ clusterId: `org-${index}`, values }));

  it('is exactly reproducible for the same seed and differs for another', () => {
    const clusters = clustersOf([
      [1, 1, 0],
      [1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
    ]);
    const a = clusterBootstrapLowerBound(clusters, 0.05, 2000, 1234);
    const b = clusterBootstrapLowerBound(clusters, 0.05, 2000, 1234);
    const c = clusterBootstrapLowerBound(clusters, 0.05, 2000, 99);
    expect(a.lowerBound).toBe(b.lowerBound);
    expect(a.lowerBound).not.toBe(c.lowerBound);
  });

  it('never reports a bound above its own point estimate', () => {
    const clusters = clustersOf([
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 0],
      [1, 1, 1],
      [0, 1, 1],
    ]);
    const result = clusterBootstrapLowerBound(clusters, 0.05, 4000, 7);
    expect(result.lowerBound).toBeLessThanOrEqual(result.pointEstimate);
    expect(result.items).toBe(15);
    expect(result.clusters).toBe(5);
  });

  it('penalises errors CONCENTRATED in few organisations over the same errors SPREAD OUT', () => {
    // This is the property the organisation-clustered design exists for.
    // Both corpora are 12 organisations x 4 pages = 48 items with exactly 6
    // errors, so the item-level point estimate is identical (42/48) and a
    // naive per-item binomial bound cannot tell them apart. But six errors
    // inside one-and-a-half organisations is evidence that whole
    // organisations fail, while six errors spread over six organisations is
    // evidence of scattered page-level noise - and only the clustered bound
    // distinguishes them.
    const perfect = [1, 1, 1, 1];
    const concentrated = clustersOf([
      [0, 0, 0, 0],
      [0, 0, 1, 1],
      ...Array.from({ length: 10 }, () => [...perfect]),
    ]);
    const dispersed = clustersOf([
      ...Array.from({ length: 6 }, () => [0, 1, 1, 1]),
      ...Array.from({ length: 6 }, () => [...perfect]),
    ]);

    const concentratedResult = clusterBootstrapLowerBound(concentrated, 0.05, 20_000, 42);
    const dispersedResult = clusterBootstrapLowerBound(dispersed, 0.05, 20_000, 42);

    // Identical point estimates: the naive view really cannot separate them.
    expect(concentratedResult.pointEstimate).toBeCloseTo(42 / 48, 12);
    expect(dispersedResult.pointEstimate).toBeCloseTo(42 / 48, 12);
    expect(clopperPearsonLowerBound(42, 48)).toBeCloseTo(clopperPearsonLowerBound(42, 48), 12);

    // The clustered bound does separate them, and punishes concentration.
    expect(concentratedResult.lowerBound).toBeLessThan(dispersedResult.lowerBound);
  });

  it('refuses a degenerate request rather than returning a misleading bound', () => {
    expect(() => clusterBootstrapLowerBound([], 0.05)).toThrow(/zero clusters/i);
    expect(() => clusterBootstrapLowerBound(clustersOf([[]]), 0.05)).toThrow(/no items/i);
    expect(() => clusterBootstrapLowerBound(clustersOf([[1]]), 0.05, 0)).toThrow(/at least 1/i);
  });
});

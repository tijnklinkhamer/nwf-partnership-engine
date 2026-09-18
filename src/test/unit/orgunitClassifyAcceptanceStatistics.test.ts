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
  binomialLowerTail,
  ceilingGateFeasibility,
  certificationAcceptanceProbability,
  certificationBoundary,
  clopperPearsonLowerBound,
  clopperPearsonUpperBound,
  clusterBootstrapLowerBound,
  clusterDeflatedBound,
  criticalEventsForUpperCertification,
  criticalSuccessesForLowerCertification,
  DEFAULT_ALPHA,
  designEffect,
  estimatorVarianceDecomposition,
  gateFeasibility,
  intraclassCorrelation,
  maxErrorsUnderPointThreshold,
  maxEventsUnderPointCeiling,
  minimumDenominatorForPower,
  minimumTrialsToCertify,
  minimumTrialsToCertifyCeiling,
  passEveryReplicateAcceptanceProbability,
  replicateDispersion,
  requiredPerReplicatePass,
  type CertificationRule,
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

/* ------------------------------------------------------------------ *
 * R1 ADDITIONS - the upper bound, the operating characteristic, and
 * the cluster-aware instrument. Same discipline: integers in,
 * rationals out, no provider, no gold, no holdout.
 * ------------------------------------------------------------------ */

describe('clopperPearsonUpperBound - the instrument the SIXTH gate needs', () => {
  it('uses the exact closed form when nothing happened', () => {
    // k === 0 has the closed form 1 - alpha ** (1 / n).
    for (const trials of [11, 19, 49, 200]) {
      expect(clopperPearsonUpperBound(0, trials)).toBeCloseTo(1 - Math.pow(0.05, 1 / trials), 12);
    }
    expect(clopperPearsonUpperBound(0, 49)).toBeCloseTo(0.0593, 4);
    expect(clopperPearsonUpperBound(0, 11)).toBeCloseTo(0.2384, 4);
  });

  it('satisfies the DEFINING property, checked by direct binomial summation', () => {
    // The bound is defined by P(X <= k | n, bound) === alpha. Verified with
    // a plain pmf sum rather than by restating the implementation.
    const logChoose = (n: number, k: number): number => {
      let total = 0;
      for (let i = 1; i <= k; i += 1) total += Math.log(n - k + i) - Math.log(i);
      return total;
    };
    const tailAtMost = (k: number, n: number, p: number): number => {
      let total = 0;
      for (let i = 0; i <= k; i += 1) {
        total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
      }
      return total;
    };
    for (const [k, n] of [
      [2, 49],
      [7, 49],
      [1, 21],
      [15, 100],
      [30, 200],
    ] as const) {
      expect(tailAtMost(k, n, clopperPearsonUpperBound(k, n))).toBeCloseTo(DEFAULT_ALPHA, 9);
    }
  });

  it('is the exact reflection of the lower bound, and never below the point estimate', () => {
    for (const [k, n] of [
      [2, 49],
      [7, 49],
      [12, 49],
      [0, 20],
      [20, 20],
    ] as const) {
      expect(clopperPearsonUpperBound(k, n)).toBeCloseTo(
        1 - clopperPearsonLowerBound(n - k, n),
        12,
      );
      expect(clopperPearsonUpperBound(k, n)).toBeGreaterThanOrEqual(k / n);
    }
  });

  it('is monotone in events and refuses an undefined request', () => {
    let previous = -1;
    for (let k = 0; k <= 20; k += 1) {
      const bound = clopperPearsonUpperBound(k, 20);
      expect(bound).toBeGreaterThan(previous);
      previous = bound;
    }
    expect(clopperPearsonUpperBound(20, 20)).toBe(1);
    expect(() => clopperPearsonUpperBound(1, 0)).toThrow(/zero trials/i);
    expect(() => clopperPearsonUpperBound(5, 4)).toThrow(/cannot exceed/i);
  });
});

describe('the SIXTH gate - maxNeedsReviewRate is a CEILING, not a floor', () => {
  it('reports the minimum denominator each ceiling needs', () => {
    expect(minimumTrialsToCertifyCeiling(0.25)).toBe(11);
    expect(minimumTrialsToCertifyCeiling(0.15)).toBe(19);
    // And each minimum really is minimal.
    for (const [ceiling, n] of [
      [0.25, 11],
      [0.15, 19],
    ] as const) {
      expect(clopperPearsonUpperBound(0, n)).toBeLessThanOrEqual(ceiling);
      expect(clopperPearsonUpperBound(0, n - 1)).toBeGreaterThan(ceiling);
    }
  });

  it('is the ONE frozen gate already certifiable at the historical denominator', () => {
    const feasibility = ceilingGateFeasibility(0.15, 49);
    expect(feasibility.certifiableAtThisDenominator).toBe(true);
    expect(feasibility.bestAttainableUpperBound).toBeCloseTo(0.0593, 4);
    expect(feasibility.additionalTrialsRequired).toBe(0);
  });

  it('exposes the inversion: certification is STRICTER than its own point gate', () => {
    const feasibility = ceilingGateFeasibility(0.15, 49);
    // 7 of 49 passes the point gate (0.1429 <= 0.15) and fails certification.
    expect(feasibility.pointEstimateEventTolerance).toBe(7);
    expect(maxEventsUnderPointCeiling(0.15, 49)).toBe(7);
    expect(feasibility.maxEventsStillCertifying).toBe(2);
    expect(criticalEventsForUpperCertification(0.15, 49)).toBe(2);
    expect(7 / 49).toBeLessThanOrEqual(0.15);
    expect(clopperPearsonUpperBound(7, 49)).toBeGreaterThan(0.25);
  });

  it('reports not-certifiable rather than pretending, at a denominator too small', () => {
    const feasibility = ceilingGateFeasibility(0.15, 14);
    expect(feasibility.certifiableAtThisDenominator).toBe(false);
    expect(feasibility.maxEventsStillCertifying).toBeNull();
    expect(feasibility.additionalTrialsRequired).toBe(5);
  });

  it('computes an exact operating characteristic in the ceiling direction', () => {
    const rule: CertificationRule = {
      direction: 'lower is better',
      pointTarget: 0.15,
      certificationLevel: 0.25,
      denominator: 200,
      alpha: 0.05,
      clustering: { averageClusterSize: 8, icc: 0.1 },
    };
    const boundary = certificationBoundary(rule);
    expect(boundary.feasible).toBe(true);
    expect(boundary.criticalCount).toBe(30);
    // Lower really is better: acceptance falls as the true rate rises.
    const at10 = certificationAcceptanceProbability(rule, 0.1);
    const at15 = certificationAcceptanceProbability(rule, 0.15);
    const at20 = certificationAcceptanceProbability(rule, 0.2);
    expect(at10).toBeGreaterThan(at15);
    expect(at15).toBeGreaterThan(at20);
    expect(at20).toBeLessThan(0.05);
    expect(at10).toBeCloseTo(binomialLowerTail(30, 200, 0.1), 12);
  });
});

describe('all six gates have a stated, computable decision boundary', () => {
  // (id, direction, point target, certification level, denominator, mean
  // cluster size) - the R1 corpus option B profile, as the document
  // publishes it. G1 is a declared zero-tolerance gate and has no level.
  const SIX_GATES = [
    ['G2 unitPageRecall', 'higher is better', 0.95, 0.9, 100, 4, 97],
    ['G3 unitPagePrecision', 'higher is better', 0.9, 0.85, 66, 2, 62],
    ['G4 unitTypeAccuracy', 'higher is better', 0.85, 0.75, 100, 4, 85],
    ['G5 hardNegativeRejection', 'higher is better', 0.9, 0.85, 155, 4, 141],
    ['G6 needsReviewRate', 'lower is better', 0.15, 0.25, 360, 8, 54],
  ] as const;

  it.each(SIX_GATES)(
    '%s has a feasible, NON-DEGENERATE boundary at its proposed denominator',
    (_id, direction, pointTarget, level, denominator, clusterSize, expectedCritical) => {
      const rule: CertificationRule = {
        direction,
        pointTarget,
        certificationLevel: level,
        denominator,
        alpha: 0.05,
        clustering: { averageClusterSize: clusterSize, icc: 0.1 },
      };
      const boundary = certificationBoundary(rule);
      expect(boundary.feasible).toBe(true);
      expect(boundary.criticalCount).toBe(expectedCritical);
      // NON-DEGENERATE: the gate tolerates at least one error. A gate whose
      // critical count equals its denominator is a zero-tolerance gate
      // wearing a percentage label, which is the defect being removed.
      if (direction === 'higher is better')
        expect(boundary.criticalCount).toBeLessThan(denominator);
      else expect(boundary.criticalCount).toBeGreaterThan(0);
      // And the guarantee: acceptance at the certification level is bounded.
      expect(certificationAcceptanceProbability(rule, level)).toBeLessThanOrEqual(0.05);
    },
  );

  it('G1 at 0.99 is a zero-tolerance gate at every attainable denominator', () => {
    // Undeflated, 299 items is the first denominator that certifies 0.99 -
    // and it still permits zero errors. Deflated it is worse. No corpus this
    // project could acquire makes G1 a tolerant rate gate.
    expect(minimumTrialsToCertify(0.99)).toBe(299);
    for (const denominator of [299, 400, 472]) {
      expect(criticalSuccessesForLowerCertification(0.99, denominator)).toBe(denominator);
    }
    // Undeflated, it first tolerates a SINGLE error at 473 items - already
    // beyond the largest gated split any corpus option proposes.
    expect(minimumTrialsToCertify(0.99, 1)).toBe(473);
    expect(criticalSuccessesForLowerCertification(0.99, 473)).toBe(472);
    // Under the design effect a real clustered sample carries, that first
    // single-error tolerance arrives at 805 items.
    const deflated = (denominator: number): CertificationRule => ({
      direction: 'higher is better',
      pointTarget: 0.99,
      certificationLevel: 0.99,
      denominator,
      alpha: 0.05,
      clustering: { averageClusterSize: 8, icc: 0.1 },
    });
    expect(certificationBoundary(deflated(804)).criticalCount).toBe(804);
    expect(certificationBoundary(deflated(805)).criticalCount).toBe(804);
  });
});

describe('certificationBoundary and its operating characteristic', () => {
  it('reduces to a single binomial tail, so the OC needs no simulation', () => {
    const rule: CertificationRule = {
      direction: 'higher is better',
      pointTarget: 0.95,
      certificationLevel: null,
      denominator: 14,
      alpha: 0.05,
    };
    const boundary = certificationBoundary(rule);
    expect(boundary.criticalCount).toBe(14);
    expect(boundary.bindingCondition).toBe('point');
    // The frozen 14-item recall gate: only 14/14 passes, and a candidate
    // whose true recall is exactly the 0.95 the gate names passes 0.4877.
    expect(certificationAcceptanceProbability(rule, 0.95)).toBeCloseTo(Math.pow(0.95, 14), 6);
  });

  it('names which condition binds, and reports an infeasible rule as infeasible', () => {
    const feasible = certificationBoundary({
      direction: 'higher is better',
      pointTarget: 0.95,
      certificationLevel: 0.9,
      denominator: 100,
      alpha: 0.05,
    });
    expect(feasible.bindingCondition).toBe('bound');
    const infeasible = certificationBoundary({
      direction: 'higher is better',
      pointTarget: 0.95,
      certificationLevel: 0.95,
      denominator: 14,
      alpha: 0.05,
    });
    expect(infeasible.feasible).toBe(false);
    expect(infeasible.criticalCount).toBeNull();
    expect(certificationAcceptanceProbability(infeasible.rule, 1)).toBe(0);
  });

  it('shows acceptance is NOT monotone in the denominator for an exact discrete test', () => {
    // This is why a pre-registered denominator must be chosen on its
    // computed operating characteristic, never by rounding a sample-size
    // formula upward.
    const power = (denominator: number): number =>
      certificationAcceptanceProbability(
        {
          direction: 'higher is better',
          pointTarget: 0.95,
          certificationLevel: 0.9,
          denominator,
          alpha: 0.05,
          clustering: { averageClusterSize: 4, icc: 0.1 },
        },
        0.975,
      );
    expect(power(70)).toBeLessThan(power(60));
    expect(power(80)).toBeGreaterThan(power(60));
  });

  it('finds the smallest denominator reaching a target power, or reports none', () => {
    const makeRule = (denominator: number): CertificationRule => ({
      direction: 'higher is better',
      pointTarget: 0.95,
      certificationLevel: 0.9,
      denominator,
      alpha: 0.05,
    });
    const found = minimumDenominatorForPower(makeRule, 0.98, 0.8, 500)!;
    expect(certificationAcceptanceProbability(makeRule(found), 0.98)).toBeGreaterThanOrEqual(0.8);
    // Certifying the THRESHOLD ITSELF at 80% power is unreachable, and the
    // search says so rather than truncating.
    const atTheThreshold = (denominator: number): CertificationRule => ({
      ...makeRule(denominator),
      certificationLevel: 0.95,
    });
    expect(minimumDenominatorForPower(atTheThreshold, 0.95, 0.8, 400)).toBeNull();
  });
});

describe('the cluster-aware instrument', () => {
  it('computes the design effect and never scores clustering as helpful', () => {
    expect(designEffect(4, 0.1)).toBeCloseTo(1.3, 12);
    expect(designEffect(8, 0.1)).toBeCloseTo(1.7, 12);
    expect(designEffect(1, 0.5)).toBe(1);
    expect(designEffect(10, 0)).toBe(1);
    expect(() => designEffect(0.5, 0.1)).toThrow(/at least 1/i);
    expect(() => designEffect(4, 1.5)).toThrow(/icc/i);
  });

  it('deflates conservatively: the bound never exceeds the undeflated one', () => {
    for (const [k, n] of [
      [95, 100],
      [140, 155],
      [59, 60],
    ] as const) {
      const deflated = clusterDeflatedBound(k, n, 4, 0.1);
      expect(deflated.effectiveTrials).toBeLessThan(n);
      expect(deflated.lowerBound).toBeLessThanOrEqual(clopperPearsonLowerBound(k, n));
      expect(deflated.upperBound).toBeGreaterThanOrEqual(clopperPearsonUpperBound(n - k, n));
    }
  });

  it('is a no-op at an ICC of zero, so the correction is exactly the clustering', () => {
    const deflated = clusterDeflatedBound(95, 100, 4, 0);
    expect(deflated.designEffect).toBe(1);
    expect(deflated.effectiveTrials).toBe(100);
    expect(deflated.lowerBound).toBeCloseTo(clopperPearsonLowerBound(95, 100), 12);
  });

  it('estimates an intraclass correlation and floors it at zero', () => {
    const clusters = (values: readonly number[][]) =>
      values.map((cluster, index) => ({ clusterId: `org-${index}`, values: cluster }));
    // Errors concentrated in whole organisations: strongly positive ICC.
    const concentrated = intraclassCorrelation(
      clusters([
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
      ]),
    );
    // The same error count spread evenly: no organisation signal.
    const dispersed = intraclassCorrelation(
      clusters([
        [0, 0, 1, 1],
        [0, 0, 1, 1],
        [0, 0, 1, 1],
        [0, 0, 1, 1],
        [1, 1, 1, 1],
        [1, 1, 1, 1],
      ]),
    );
    expect(concentrated).toBeGreaterThan(0.5);
    expect(dispersed).toBeLessThan(concentrated);
    expect(dispersed).toBeGreaterThanOrEqual(0);
    expect(() => intraclassCorrelation(clusters([[1, 1]]))).toThrow(/at least 2 clusters/i);
  });
});

describe('estimatorVarianceDecomposition - why N = 5 is not evidence', () => {
  it('separates the sample component from the stochastic component', () => {
    const decomposition = estimatorVarianceDecomposition({
      betweenItemVariance: 0.2,
      withinItemVariance: 0.05,
      items: 100,
      replicates: 5,
    });
    expect(decomposition.sampleComponent).toBeCloseTo(0.2 / 100, 12);
    expect(decomposition.stochasticComponent).toBeCloseTo(0.05 / 500, 12);
    expect(decomposition.total).toBeCloseTo(0.002 + 0.0001, 12);
    expect(decomposition.inferenceBudget).toBe(500);
  });

  it('shows replication is the STRICTLY DOMINATED use of a fixed inference budget', () => {
    // At a fixed budget n * R the variance is
    // (R * between + within) / budget, strictly increasing in R. This holds
    // for every positive pair of components, so it needs no measurement.
    for (const between of [0.02, 0.1, 0.4]) {
      for (const within of [0.02, 0.1, 0.4]) {
        let previous = Number.NEGATIVE_INFINITY;
        for (const replicates of [1, 2, 4, 5, 10]) {
          const total = estimatorVarianceDecomposition({
            betweenItemVariance: between,
            withinItemVariance: within,
            items: 1000 / replicates,
            replicates,
          }).total;
          expect(total).toBeGreaterThan(previous);
          previous = total;
        }
      }
    }
  });

  it('refuses a degenerate request rather than dividing by zero', () => {
    expect(() =>
      estimatorVarianceDecomposition({
        betweenItemVariance: 0.1,
        withinItemVariance: 0.1,
        items: 0,
        replicates: 1,
      }),
    ).toThrow(/at least 1/i);
    expect(() =>
      estimatorVarianceDecomposition({
        betweenItemVariance: -0.1,
        withinItemVariance: 0.1,
        items: 10,
        replicates: 1,
      }),
    ).toThrow(/non-negative/i);
  });
});

/**
 * PURE statistical primitives for ACCEPTANCE METHODOLOGY V2 (Phase 2B-2D).
 *
 * These exist for ONE reason: the Phase 2B-2D acceptance gates frozen in
 * `protocol.ts` are POINT-ESTIMATE gates applied to denominators so small
 * that no attainable observation can establish the threshold the gate
 * names. `minUnitPageRecall >= 0.95` over 14 gold UNIT_PAGE items is not a
 * 95% gate: 13/14 = 0.9286 fails, so the only passing observation is 14/14,
 * and even 14/14 carries an exact one-sided 95% lower bound of 0.8074 -
 * well below the 0.95 the gate claims to enforce.
 *
 * A methodology that cannot tell "we measured 0.95" from "the true rate is
 * at least 0.95" cannot select a production classifier. These helpers make
 * that distinction computable, and make a gate's FEASIBILITY checkable
 * BEFORE the gate is frozen and before any candidate exists.
 *
 * Every function here is CANDIDATE-INDEPENDENT: none reads a model result,
 * a prompt, a gold label or a corpus. They take integers and return
 * integers and rationals.
 *
 * PURE. No network, no database, no filesystem, no clock, no environment,
 * no `Math.random`, no `Date.now`. Randomised procedures take an explicit
 * integer seed and are exactly reproducible.
 *
 * Nothing here is itself a gate, a threshold or an acceptance decision.
 * The proposed rule that uses them is
 * `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL.json`,
 * which is a PROPOSAL and authorises nothing.
 */

/** One-sided confidence level used throughout unless a caller overrides it. */
export const DEFAULT_ALPHA = 0.05;

/** Bisection iterations for the inverse-beta search. 200 is far past float precision. */
const BISECTION_ITERATIONS = 200;

/** Lanczos g and coefficients for `logGamma`. */
const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
] as const;

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = z - 1;
  let series = LANCZOS_COEFFICIENTS[0]!;
  for (let i = 1; i < LANCZOS_G + 2; i += 1) series += LANCZOS_COEFFICIENTS[i]! / (x + i);
  const t = x + LANCZOS_G + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(series);
}

/** Continued-fraction expansion of the incomplete beta function (Lentz's method). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITERATIONS = 300;
  const EPSILON = 3e-16;
  const TINY = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITERATIONS; m += 1) {
    const m2 = 2 * m;
    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;
    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return h;
}

/** Regularised incomplete beta function I_x(a, b). */
export function regularisedIncompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** P(X >= successes) for X ~ Binomial(trials, p). */
export function binomialUpperTail(successes: number, trials: number, p: number): number {
  if (successes <= 0) return 1;
  if (successes > trials) return 0;
  return regularisedIncompleteBeta(successes, trials - successes + 1, p);
}

/**
 * EXACT (Clopper-Pearson) one-sided lower confidence bound on a binomial
 * proportion: the largest p for which observing at least `successes` of
 * `trials` still has probability > alpha.
 *
 * This is the conservative choice on purpose. A Wald or Wilson interval at
 * these denominators (14, 21, 49) is anti-conservative exactly where the
 * decision is being made - near the boundary, with few trials.
 *
 * `successes === trials` has the closed form `alpha ** (1 / trials)`, which
 * is used directly rather than found by search.
 */
export function clopperPearsonLowerBound(
  successes: number,
  trials: number,
  alpha: number = DEFAULT_ALPHA,
): number {
  assertCount(successes, 'successes');
  assertCount(trials, 'trials');
  // Checked BEFORE the successes/trials comparison: an empty denominator is
  // the interesting failure (a vacuous gate), and reporting it as an
  // arithmetic mismatch would bury the reason a caller needs to hear.
  if (trials === 0) {
    throw new Error(
      'a lower bound over zero trials is undefined; an unmeasured gate is not a passed gate.',
    );
  }
  if (successes > trials) {
    throw new Error(`successes (${successes}) cannot exceed trials (${trials}).`);
  }
  if (!(alpha > 0 && alpha < 1)) throw new Error(`alpha must be in (0, 1); received ${alpha}.`);
  if (successes === 0) return 0;
  if (successes === trials) return Math.pow(alpha, 1 / trials);
  let low = 0;
  let high = 1;
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    if (binomialUpperTail(successes, trials, mid) > alpha) high = mid;
    else low = mid;
  }
  return low;
}

/**
 * The smallest number of trials at which `allowedErrors` observed errors
 * still certifies `threshold` - i.e. the smallest n with
 * `clopperPearsonLowerBound(n - allowedErrors, n, alpha) >= threshold`.
 *
 * Returns `null` when no n at or below `searchCeiling` suffices, so a
 * caller can report "not attainable" rather than silently truncating.
 *
 * This is the number that should be consulted BEFORE a gate is frozen. For
 * the currently-frozen gates at alpha = 0.05 and zero allowed errors it
 * returns: 0.99 -> 299, 0.95 -> 59, 0.90 -> 29, 0.85 -> 19.
 */
export function minimumTrialsToCertify(
  threshold: number,
  allowedErrors: number = 0,
  alpha: number = DEFAULT_ALPHA,
  searchCeiling = 100_000,
): number | null {
  assertThreshold(threshold);
  assertCount(allowedErrors, 'allowedErrors');
  for (let trials = allowedErrors + 1; trials <= searchCeiling; trials += 1) {
    if (clopperPearsonLowerBound(trials - allowedErrors, trials, alpha) >= threshold) return trials;
  }
  return null;
}

/**
 * The largest number of errors a POINT-ESTIMATE gate tolerates at a given
 * denominator: the largest e with `(n - e) / n >= threshold`.
 *
 * This is what exposes the gates that only LOOK tolerant. At n = 14 and
 * threshold 0.95 it returns 0 - the gate is a zero-miss gate wearing a
 * 95% label. At n = 49 and threshold 0.99 it likewise returns 0.
 */
export function maxErrorsUnderPointThreshold(threshold: number, denominator: number): number {
  assertThreshold(threshold);
  assertCount(denominator, 'denominator');
  if (denominator === 0) return 0;
  let tolerated = 0;
  for (let errors = 0; errors <= denominator; errors += 1) {
    if ((denominator - errors) / denominator >= threshold) tolerated = errors;
    else break;
  }
  return tolerated;
}

/** What a feasibility check reports about one proposed (threshold, denominator) pair. */
export interface GateFeasibility {
  readonly threshold: number;
  readonly denominator: number;
  readonly alpha: number;
  /** Errors tolerated by the POINT estimate at this denominator. */
  readonly pointEstimateErrorTolerance: number;
  /** True when the point gate is really a zero-tolerance gate. */
  readonly pointEstimateIsZeroTolerance: boolean;
  /** Best attainable exact lower bound here: the bound at zero observed errors. */
  readonly bestAttainableLowerBound: number;
  /** Whether a flawless observation at this denominator certifies the threshold. */
  readonly certifiableAtThisDenominator: boolean;
  /** Trials needed for a flawless observation to certify the threshold. */
  readonly minimumTrialsForZeroErrorCertification: number | null;
  /** Shortfall in trials; 0 when already certifiable. */
  readonly additionalTrialsRequired: number | null;
}

/**
 * Can a gate of this shape ever be established at this denominator?
 *
 * A gate that fails `certifiableAtThisDenominator` is not a strict gate -
 * it is an unfalsifiable one. Even a perfect candidate cannot demonstrate
 * the property the gate names, so passing it carries no evidential weight
 * about the threshold, and failing it carries no evidential weight either.
 * Every currently-frozen Phase 2B-2D gate fails this check at its own DEV
 * denominator.
 */
export function gateFeasibility(
  threshold: number,
  denominator: number,
  alpha: number = DEFAULT_ALPHA,
): GateFeasibility {
  assertThreshold(threshold);
  assertCount(denominator, 'denominator');
  const bestAttainableLowerBound =
    denominator === 0 ? 0 : clopperPearsonLowerBound(denominator, denominator, alpha);
  const certifiable = denominator > 0 && bestAttainableLowerBound >= threshold;
  const minimumTrials = minimumTrialsToCertify(threshold, 0, alpha);
  const pointTolerance = maxErrorsUnderPointThreshold(threshold, denominator);
  return {
    threshold,
    denominator,
    alpha,
    pointEstimateErrorTolerance: pointTolerance,
    pointEstimateIsZeroTolerance: pointTolerance === 0,
    bestAttainableLowerBound,
    certifiableAtThisDenominator: certifiable,
    minimumTrialsForZeroErrorCertification: minimumTrials,
    additionalTrialsRequired:
      minimumTrials === null ? null : Math.max(0, minimumTrials - denominator),
  };
}

/**
 * Probability that a `pass every one of N replicates` rule accepts a
 * candidate whose per-replicate pass probability is `perReplicatePass`.
 *
 * This is the number the frozen F6 rule never computed. A candidate whose
 * TRUE per-item recall is exactly the 0.95 the gate names passes a
 * zero-miss 14-item recall gate with probability 0.95 ** 14 = 0.4877, and
 * therefore passes five such replicates with probability 0.0276: the rule
 * rejects a threshold-compliant candidate about 97 times in 100.
 */
export function passEveryReplicateAcceptanceProbability(
  perReplicatePass: number,
  replicates: number,
): number {
  if (!(perReplicatePass >= 0 && perReplicatePass <= 1)) {
    throw new Error(`perReplicatePass must be in [0, 1]; received ${perReplicatePass}.`);
  }
  assertCount(replicates, 'replicates');
  return Math.pow(perReplicatePass, replicates);
}

/**
 * The per-replicate pass probability a `pass every one of N` rule demands
 * in order to accept a genuinely-good candidate at rate `targetAcceptance`.
 */
export function requiredPerReplicatePass(targetAcceptance: number, replicates: number): number {
  if (!(targetAcceptance > 0 && targetAcceptance <= 1)) {
    throw new Error(`targetAcceptance must be in (0, 1]; received ${targetAcceptance}.`);
  }
  assertCount(replicates, 'replicates');
  if (replicates === 0) throw new Error('replicates must be at least 1.');
  return Math.pow(targetAcceptance, 1 / replicates);
}

/** Dispersion of one metric across replicates - the STABILITY evidence. */
export interface ReplicateDispersion {
  readonly replicates: number;
  readonly minimum: number;
  readonly maximum: number;
  /** `maximum - minimum`. The only dispersion statistic that needs no distributional assumption. */
  readonly range: number;
  readonly mean: number;
}

/**
 * Descriptive dispersion across replicates. Deliberately NOT a standard
 * deviation used for inference: at N = 5 a sample sd has no useful
 * sampling distribution here, and F0U s9 already recorded that asymptotic
 * approximations are unreliable at this N.
 */
export function replicateDispersion(values: readonly number[]): ReplicateDispersion {
  if (values.length === 0) throw new Error('dispersion over zero replicates is undefined.');
  let minimum = values[0]!;
  let maximum = values[0]!;
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error(`replicate value ${value} is not finite.`);
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
    total += value;
  }
  return {
    replicates: values.length,
    minimum,
    maximum,
    range: maximum - minimum,
    mean: total / values.length,
  };
}

/** A deterministic 32-bit PRNG. Explicitly seeded, so a bootstrap is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One cluster's contribution: the per-item values observed inside it. */
export interface Cluster {
  readonly clusterId: string;
  readonly values: readonly number[];
}

export interface ClusterBootstrapResult {
  readonly clusters: number;
  readonly items: number;
  readonly pointEstimate: number;
  readonly lowerBound: number;
  readonly alpha: number;
  readonly resamples: number;
  readonly seed: number;
}

/**
 * One-sided lower confidence bound on a mean, resampling WHOLE CLUSTERS
 * with replacement.
 *
 * The cluster is the organisation. This is the correction for the single
 * largest unrecorded defect in the existing methodology: the 49
 * DEVELOPMENT items come from 12 organisations (3-5 items each), items
 * within an organisation share templates, navigation and site conventions,
 * and DEVELOPMENT and HOLDOUT are NOT organisation-disjoint. Treating 49
 * pages as 49 independent draws overstates the evidence; and because the
 * production question is about ORGANISATIONS, the organisation is also the
 * unit the estimate should generalise over.
 *
 * The bound is the `alpha` percentile of the bootstrap distribution of the
 * cluster-weighted mean. With few clusters this is itself approximate -
 * which is exactly why the proposal's corpus design targets a cluster
 * count large enough for it to mean something, and why the proposal
 * requires the exact binomial bound to be reported ALONGSIDE it rather
 * than replaced by it.
 */
export function clusterBootstrapLowerBound(
  clusters: readonly Cluster[],
  alpha: number = DEFAULT_ALPHA,
  resamples = 10_000,
  seed = 20260918,
): ClusterBootstrapResult {
  if (clusters.length === 0) {
    throw new Error('a cluster bootstrap over zero clusters is undefined.');
  }
  if (!(alpha > 0 && alpha < 1)) throw new Error(`alpha must be in (0, 1); received ${alpha}.`);
  assertCount(resamples, 'resamples');
  if (resamples === 0) throw new Error('resamples must be at least 1.');
  for (const cluster of clusters) {
    if (cluster.values.length === 0) {
      throw new Error(`cluster ${cluster.clusterId} contributes no items.`);
    }
  }
  const meanOf = (selected: readonly Cluster[]): number => {
    let total = 0;
    let count = 0;
    for (const cluster of selected) {
      for (const value of cluster.values) {
        total += value;
        count += 1;
      }
    }
    return total / count;
  };
  const pointEstimate = meanOf(clusters);
  const random = mulberry32(seed);
  const distribution: number[] = [];
  const draw: Cluster[] = new Array<Cluster>(clusters.length);
  for (let r = 0; r < resamples; r += 1) {
    for (let i = 0; i < clusters.length; i += 1) {
      draw[i] = clusters[Math.floor(random() * clusters.length)]!;
    }
    distribution.push(meanOf(draw));
  }
  distribution.sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(distribution.length - 1, Math.floor(alpha * distribution.length)),
  );
  return {
    clusters: clusters.length,
    items: clusters.reduce((total, cluster) => total + cluster.values.length, 0),
    pointEstimate,
    lowerBound: distribution[index]!,
    alpha,
    resamples,
    seed,
  };
}

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer; received ${value}.`);
  }
}

function assertThreshold(value: number): void {
  if (!(value > 0 && value <= 1)) {
    throw new Error(`threshold must be in (0, 1]; received ${value}.`);
  }
}

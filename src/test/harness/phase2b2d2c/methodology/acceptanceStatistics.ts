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
 * `docs/evaluation/PHASE_2B_2D_ACCEPTANCE_METHODOLOGY_V2_PROPOSAL_R2.json`,
 * which is a PROPOSAL and authorises nothing.
 *
 * EVALUATION / DESIGN TOOLING, NOT PRODUCTION CODE. This module lives under
 * `src/test/harness/` deliberately. It was first written under
 * `src/orgunits/classify/evaluation/`, which made it a new file inside the
 * production classifier namespace that the historical F7 firewall
 * (`src/test/firewall/phase2b2d2cF7RestartExecution.firewall.test.ts`)
 * correctly freezes relative to the F6 execution approval. The firewall was
 * RIGHT and was not weakened: the module moved instead, in Methodology V2 R2.
 * `src/test/**` is excluded from `tsconfig.build.json`, so nothing here can
 * reach `dist/`; no production module, classifier runtime path or provider
 * path may import it, and `orgunitClassifyAcceptanceMethodologyV2R2.test.ts`
 * asserts that.
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

/* ------------------------------------------------------------------ *
 * R1 ADDITIONS (methodology revision R1)
 *
 * Everything below was added for the R1 revision, which had to answer
 * three questions the first proposal could not:
 *
 *   - the SIXTH gate. `maxNeedsReviewRate <= 0.15` is a LOWER-IS-BETTER
 *     rate, so its uncertainty question is an UPPER bound, not a lower
 *     one. The first proposal's feasibility table simply omitted it.
 *   - the OPERATING CHARACTERISTIC of a certification rule: for a given
 *     true rate, how often does the rule accept? Neither the frozen rule
 *     nor the first proposal ever computed one, which is why neither
 *     could say what its thresholds cost.
 *   - a cluster-aware bound that is EXACT and pre-registerable at ~30
 *     organisations. The first proposal reached for a percentile cluster
 *     bootstrap, whose coverage at that few clusters is itself unknown.
 *
 * Still PURE, still seeded where randomised, still candidate-independent.
 * ------------------------------------------------------------------ */

/**
 * Rate comparisons are made on floating-point quotients, and `k / n >= t`
 * must not flip on a representation error: at n = 20, t = 0.15, the exact
 * answer `3 / 20 === 0.15` is representable, but `0.15 * 20` is not always
 * the same float as `3`. Every rate comparison here carries this slack,
 * which is far below any difference an integer count can produce.
 */
const RATE_EPSILON = 1e-9;

/**
 * EXACT (Clopper-Pearson) one-sided UPPER confidence bound: the smallest p
 * for which observing at most `events` of `trials` still has probability
 * `alpha`.
 *
 * This is the instrument the NEEDS_REVIEW gate needs and never had. A
 * lower bound answers "is the true rate at least X"; a ceiling gate asks
 * "is the true rate at most X", and applying an LCB to it would certify
 * the wrong direction.
 *
 * Derived from the lower bound by the exact binomial reflection
 * `U(k, n) = 1 - L(n - k, n)`, so the two can never disagree.
 */
export function clopperPearsonUpperBound(
  events: number,
  trials: number,
  alpha: number = DEFAULT_ALPHA,
): number {
  assertCount(events, 'events');
  assertCount(trials, 'trials');
  if (trials === 0) {
    throw new Error(
      'an upper bound over zero trials is undefined; an unmeasured gate is not a passed gate.',
    );
  }
  if (events > trials) throw new Error(`events (${events}) cannot exceed trials (${trials}).`);
  if (!(alpha > 0 && alpha < 1)) throw new Error(`alpha must be in (0, 1); received ${alpha}.`);
  return 1 - clopperPearsonLowerBound(trials - events, trials, alpha);
}

/**
 * The smallest number of trials at which `allowedEvents` observed events
 * still certifies a CEILING - i.e. the smallest n with
 * `clopperPearsonUpperBound(allowedEvents, n, alpha) <= ceiling`.
 *
 * At zero observed events the best attainable upper bound is
 * `1 - alpha ** (1 / n)`, so certifying a 0.25 ceiling needs 11 trials and
 * certifying the gate's own 0.15 needs 19.
 */
export function minimumTrialsToCertifyCeiling(
  ceiling: number,
  allowedEvents: number = 0,
  alpha: number = DEFAULT_ALPHA,
  searchCeiling = 100_000,
): number | null {
  if (!(ceiling > 0 && ceiling < 1))
    throw new Error(`ceiling must be in (0, 1); received ${ceiling}.`);
  assertCount(allowedEvents, 'allowedEvents');
  for (let trials = Math.max(1, allowedEvents); trials <= searchCeiling; trials += 1) {
    if (clopperPearsonUpperBound(allowedEvents, trials, alpha) <= ceiling) return trials;
  }
  return null;
}

/**
 * The largest number of events a POINT-ESTIMATE CEILING gate tolerates:
 * the largest e with `e / n <= ceiling`. The mirror of
 * `maxErrorsUnderPointThreshold` for a lower-is-better rate.
 */
export function maxEventsUnderPointCeiling(ceiling: number, denominator: number): number {
  if (!(ceiling >= 0 && ceiling < 1))
    throw new Error(`ceiling must be in [0, 1); received ${ceiling}.`);
  assertCount(denominator, 'denominator');
  return Math.floor(denominator * ceiling + RATE_EPSILON);
}

/** What a feasibility check reports about one proposed (ceiling, denominator) pair. */
export interface CeilingGateFeasibility {
  readonly ceiling: number;
  readonly denominator: number;
  readonly alpha: number;
  /** Events tolerated by the POINT estimate at this denominator. */
  readonly pointEstimateEventTolerance: number;
  /** Best attainable exact upper bound here: the bound at zero observed events. */
  readonly bestAttainableUpperBound: number;
  /** Whether a flawless observation at this denominator certifies the ceiling. */
  readonly certifiableAtThisDenominator: boolean;
  /** The largest observed event count that still certifies the ceiling; null if none does. */
  readonly maxEventsStillCertifying: number | null;
  /** Trials needed for a flawless observation to certify the ceiling. */
  readonly minimumTrialsForZeroEventCertification: number | null;
  readonly additionalTrialsRequired: number | null;
}

/**
 * Can a CEILING gate of this shape ever be established at this
 * denominator? The lower-is-better mirror of `gateFeasibility`.
 *
 * Reported separately because the sixth gate behaves differently from the
 * other five: its feasibility is driven by how FEW events are observed,
 * and it is the only frozen gate that is already certifiable at the
 * historical DEVELOPMENT denominator - which is precisely why a
 * five-row feasibility table that omits it flatters the diagnosis.
 */
export function ceilingGateFeasibility(
  ceiling: number,
  denominator: number,
  alpha: number = DEFAULT_ALPHA,
): CeilingGateFeasibility {
  if (!(ceiling > 0 && ceiling < 1))
    throw new Error(`ceiling must be in (0, 1); received ${ceiling}.`);
  assertCount(denominator, 'denominator');
  const bestAttainableUpperBound =
    denominator === 0 ? 1 : clopperPearsonUpperBound(0, denominator, alpha);
  const certifiable = denominator > 0 && bestAttainableUpperBound <= ceiling;
  const maxEventsStillCertifying =
    denominator === 0 ? null : criticalEventsForUpperCertification(ceiling, denominator, alpha);
  const minimumTrials = minimumTrialsToCertifyCeiling(ceiling, 0, alpha);
  return {
    ceiling,
    denominator,
    alpha,
    pointEstimateEventTolerance: maxEventsUnderPointCeiling(ceiling, denominator),
    bestAttainableUpperBound,
    certifiableAtThisDenominator: certifiable,
    maxEventsStillCertifying,
    minimumTrialsForZeroEventCertification: minimumTrials,
    additionalTrialsRequired:
      minimumTrials === null ? null : Math.max(0, minimumTrials - denominator),
  };
}

/**
 * The smallest success count at `trials` whose exact lower bound certifies
 * `level`; `null` when no attainable count does (the gate is infeasible
 * at this denominator).
 */
export function criticalSuccessesForLowerCertification(
  level: number,
  trials: number,
  alpha: number = DEFAULT_ALPHA,
): number | null {
  assertThreshold(level);
  assertCount(trials, 'trials');
  if (trials === 0) return null;
  return extremePassingCount(
    trials,
    'higher is better',
    (successes) => clopperPearsonLowerBound(successes, trials, alpha) >= level,
  );
}

/**
 * The largest event count at `trials` whose exact upper bound certifies
 * `ceiling`; `null` when not even zero events do.
 */
export function criticalEventsForUpperCertification(
  ceiling: number,
  trials: number,
  alpha: number = DEFAULT_ALPHA,
): number | null {
  if (!(ceiling > 0 && ceiling < 1))
    throw new Error(`ceiling must be in (0, 1); received ${ceiling}.`);
  assertCount(trials, 'trials');
  if (trials === 0) return null;
  return extremePassingCount(
    trials,
    'lower is better',
    (events) => clopperPearsonUpperBound(events, trials, alpha) <= ceiling,
  );
}

/** P(X <= events) for X ~ Binomial(trials, p). */
export function binomialLowerTail(events: number, trials: number, p: number): number {
  if (events >= trials) return 1;
  if (events < 0) return 0;
  return 1 - binomialUpperTail(events + 1, trials, p);
}

/** Which way a gate's metric improves. */
export type GateDirection = 'higher is better' | 'lower is better';

/**
 * One fully-specified certification rule, in the exact form an operating
 * characteristic can be computed for. Everything here is frozen BEFORE any
 * candidate exists; nothing reads a result.
 */
export interface CertificationRule {
  readonly direction: GateDirection;
  /** The point-estimate target. `null` drops the point condition entirely. */
  readonly pointTarget: number | null;
  /**
   * The level the confidence bound must reach (a floor when higher is
   * better, a ceiling when lower is better). `null` drops the bound
   * condition entirely - which is exactly design A.
   */
  readonly certificationLevel: number | null;
  readonly denominator: number;
  readonly alpha: number;
  /**
   * When set, the bound is computed on a CLUSTER-DEFLATED denominator
   * rather than on `denominator` itself: the design-D correction.
   */
  readonly clustering?: { readonly averageClusterSize: number; readonly icc: number };
}

/** The decision boundary of a certification rule, as an integer count. */
export interface CertificationBoundary {
  readonly rule: CertificationRule;
  /**
   * Smallest passing success count (higher-is-better) or largest passing
   * event count (lower-is-better). `null` means NO attainable observation
   * passes - the rule is infeasible at this denominator.
   */
  readonly criticalCount: number | null;
  readonly feasible: boolean;
  /** Which condition sets the boundary: the point target or the bound. */
  readonly bindingCondition: 'point' | 'bound' | 'both' | 'none';
}

/**
 * A design effect: how much a clustered sample's information falls short
 * of the same number of INDEPENDENT observations.
 *
 * `DEFF = 1 + (averageClusterSize - 1) * icc`, the standard result for
 * equal-sized clusters, floored at 1 so clustering can never be scored as
 * making a sample MORE informative than independence. That floor is what
 * makes the deflation conservative in the only direction that matters.
 */
export function designEffect(averageClusterSize: number, icc: number): number {
  if (!(averageClusterSize >= 1)) {
    throw new Error(`averageClusterSize must be at least 1; received ${averageClusterSize}.`);
  }
  if (!(icc >= 0 && icc <= 1)) throw new Error(`icc must be in [0, 1]; received ${icc}.`);
  return Math.max(1, 1 + (averageClusterSize - 1) * icc);
}

export interface ClusterDeflatedBound {
  readonly items: number;
  readonly successes: number;
  readonly designEffect: number;
  readonly effectiveTrials: number;
  readonly effectiveSuccesses: number;
  readonly lowerBound: number;
  readonly upperBound: number;
}

/**
 * An EXACT binomial bound computed on a cluster-deflated denominator.
 *
 * This replaces the percentile cluster bootstrap as the BINDING
 * instrument. The bootstrap remains available and is reported, but its
 * coverage at the ~30 organisations this project can realistically
 * acquire is itself unknown, and a decision rule may not rest on an
 * instrument whose error rate is unknown - which is the exact defect the
 * whole revision exists to remove.
 *
 * The deflation is deliberately crude and deliberately conservative:
 * effective trials round DOWN, effective successes round DOWN, and the
 * design effect never falls below 1. The resulting bound is exact
 * CONDITIONAL on the effective denominator; the denominator itself rests
 * on the ICC, which is why the methodology pre-registers a floor for it
 * rather than trusting an estimate from the data.
 */
export function clusterDeflatedBound(
  successes: number,
  trials: number,
  averageClusterSize: number,
  icc: number,
  alpha: number = DEFAULT_ALPHA,
): ClusterDeflatedBound {
  assertCount(successes, 'successes');
  assertCount(trials, 'trials');
  if (trials === 0) throw new Error('a deflated bound over zero trials is undefined.');
  if (successes > trials)
    throw new Error(`successes (${successes}) cannot exceed trials (${trials}).`);
  const deff = designEffect(averageClusterSize, icc);
  const effectiveTrials = Math.max(1, Math.floor(trials / deff));
  const effectiveSuccesses = Math.min(
    effectiveTrials,
    Math.floor((successes / trials) * effectiveTrials + RATE_EPSILON),
  );
  return {
    items: trials,
    successes,
    designEffect: deff,
    effectiveTrials,
    effectiveSuccesses,
    lowerBound: clopperPearsonLowerBound(effectiveSuccesses, effectiveTrials, alpha),
    upperBound: clopperPearsonUpperBound(
      effectiveTrials - effectiveSuccesses,
      effectiveTrials,
      alpha,
    ),
  };
}

/**
 * The integer decision boundary of a certification rule.
 *
 * Computing the boundary as a COUNT rather than as a rate is what makes
 * the operating characteristic below exact: acceptance is then a single
 * binomial tail, with no simulation anywhere.
 */
/**
 * The extreme passing count of a MONOTONE pass predicate, by binary search.
 *
 * Every condition in a certification rule is monotone in the count: more
 * successes never hurt a higher-is-better gate, and more events never help
 * a lower-is-better one. Searching rather than scanning is not a
 * micro-optimisation - it is what makes `minimumDenominatorForPower`
 * tractable, since that walks thousands of candidate denominators and each
 * boundary otherwise costs an exact binomial bound per count.
 */
function extremePassingCount(
  denominator: number,
  direction: GateDirection,
  passes: (count: number) => boolean,
): number | null {
  if (direction === 'higher is better') {
    if (!passes(denominator)) return null;
    let low = 0;
    let high = denominator;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (passes(mid)) high = mid;
      else low = mid + 1;
    }
    return low;
  }
  if (!passes(0)) return null;
  let low = 0;
  let high = denominator;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (passes(mid)) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function certificationBoundary(rule: CertificationRule): CertificationBoundary {
  const { direction, pointTarget, certificationLevel, denominator, alpha } = rule;
  assertCount(denominator, 'denominator');
  if (denominator === 0) {
    return { rule, criticalCount: null, feasible: false, bindingCondition: 'none' };
  }
  const boundPasses = (count: number): boolean => {
    if (certificationLevel === null) return true;
    if (rule.clustering) {
      const deflated = clusterDeflatedBound(
        direction === 'higher is better' ? count : denominator - count,
        denominator,
        rule.clustering.averageClusterSize,
        rule.clustering.icc,
        alpha,
      );
      return direction === 'higher is better'
        ? deflated.lowerBound >= certificationLevel
        : deflated.upperBound <= certificationLevel;
    }
    return direction === 'higher is better'
      ? clopperPearsonLowerBound(count, denominator, alpha) >= certificationLevel
      : clopperPearsonUpperBound(count, denominator, alpha) <= certificationLevel;
  };
  const pointPasses = (count: number): boolean => {
    if (pointTarget === null) return true;
    return direction === 'higher is better'
      ? count / denominator >= pointTarget - RATE_EPSILON
      : count / denominator <= pointTarget + RATE_EPSILON;
  };

  const criticalCount = extremePassingCount(
    denominator,
    direction,
    (count) => pointPasses(count) && boundPasses(count),
  );
  if (criticalCount === null) {
    return { rule, criticalCount: null, feasible: false, bindingCondition: 'none' };
  }
  const pointOnly =
    pointTarget === null ? null : extremePassingCount(denominator, direction, pointPasses);
  const boundOnly =
    certificationLevel === null ? null : extremePassingCount(denominator, direction, boundPasses);
  let binding: CertificationBoundary['bindingCondition'] = 'none';
  const pointBinds = pointOnly !== null && pointOnly === criticalCount;
  const boundBinds = boundOnly !== null && boundOnly === criticalCount;
  if (pointBinds && boundBinds) binding = 'both';
  else if (pointBinds) binding = 'point';
  else if (boundBinds) binding = 'bound';
  return { rule, criticalCount, feasible: true, bindingCondition: binding };
}

/**
 * P(this rule ACCEPTS | the candidate's true per-item rate is `trueRate`),
 * computed EXACTLY as one binomial tail under independent items.
 *
 * This is the number no version of this methodology has ever reported. A
 * threshold without an operating characteristic is an assertion about a
 * measurement, not a statement about a decision: it cannot say how often
 * it accepts something it should reject, or rejects something it should
 * accept. Every D2 design comparison in the R1 proposal is this function
 * evaluated at four pre-registered true rates.
 */
export function certificationAcceptanceProbability(
  rule: CertificationRule,
  trueRate: number,
): number {
  if (!(trueRate >= 0 && trueRate <= 1)) {
    throw new Error(`trueRate must be in [0, 1]; received ${trueRate}.`);
  }
  const boundary = certificationBoundary(rule);
  if (boundary.criticalCount === null) return 0;
  return rule.direction === 'higher is better'
    ? binomialUpperTail(boundary.criticalCount, rule.denominator, trueRate)
    : binomialLowerTail(boundary.criticalCount, rule.denominator, trueRate);
}

/**
 * The smallest denominator at which a rule's acceptance probability at
 * `trueRate` reaches `targetPower` - i.e. how large the sample must be
 * before a candidate that genuinely performs at `trueRate` is reliably
 * accepted.
 *
 * Sizing on POWER rather than on bare feasibility is the difference
 * between a corpus that CAN certify and a corpus that certifies a good
 * candidate more often than a coin. The frozen methodology sized on
 * neither.
 */
export function minimumDenominatorForPower(
  makeRule: (denominator: number) => CertificationRule,
  trueRate: number,
  targetPower: number,
  searchCeiling = 5000,
): number | null {
  if (!(targetPower > 0 && targetPower < 1)) {
    throw new Error(`targetPower must be in (0, 1); received ${targetPower}.`);
  }
  for (let denominator = 1; denominator <= searchCeiling; denominator += 1) {
    if (certificationAcceptanceProbability(makeRule(denominator), trueRate) >= targetPower) {
      return denominator;
    }
  }
  return null;
}

/**
 * ANOVA estimate of the intraclass correlation over binary cluster data,
 * floored at 0.
 *
 * Reported, and used only to ESCALATE the pre-registered ICC floor when
 * the observed clustering is worse than assumed. It is never allowed to
 * lower the assumed value: an ICC estimated from few clusters is noisy,
 * and a noisy estimate that can only shrink the denominator is safe,
 * while one that can enlarge it is not.
 */
export function intraclassCorrelation(clusters: readonly Cluster[]): number {
  if (clusters.length < 2) {
    throw new Error('an intraclass correlation needs at least 2 clusters.');
  }
  const m = clusters.length;
  let total = 0;
  let items = 0;
  let sumSquaredSizes = 0;
  for (const cluster of clusters) {
    if (cluster.values.length === 0) {
      throw new Error(`cluster ${cluster.clusterId} contributes no items.`);
    }
    items += cluster.values.length;
    sumSquaredSizes += cluster.values.length * cluster.values.length;
    for (const value of cluster.values) total += value;
  }
  const grandMean = total / items;
  let betweenSum = 0;
  let withinSum = 0;
  for (const cluster of clusters) {
    const clusterMean = cluster.values.reduce((a, b) => a + b, 0) / cluster.values.length;
    betweenSum += cluster.values.length * (clusterMean - grandMean) ** 2;
    for (const value of cluster.values) withinSum += (value - clusterMean) ** 2;
  }
  if (items === m) return 0;
  const meanSquareBetween = betweenSum / (m - 1);
  const meanSquareWithin = withinSum / (items - m);
  const n0 = (items - sumSquaredSizes / items) / (m - 1);
  const denominator = meanSquareBetween + (n0 - 1) * meanSquareWithin;
  if (denominator <= 0) return 0;
  return Math.max(0, (meanSquareBetween - meanSquareWithin) / denominator);
}

/**
 * A standard normal variate from the seeded stream (Box-Muller). The
 * second variate the transform produces is discarded, so the number of
 * uniforms consumed per call is fixed and the stream position stays a
 * deterministic function of the draws requested.
 */
function standardNormal(random: () => number): number {
  const u1 = Math.max(random(), Number.MIN_VALUE);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Marsaglia-Tsang gamma variate, with the `shape < 1` boost. */
function sampleGamma(shape: number, random: () => number): number {
  if (!(shape > 0)) throw new Error(`gamma shape must be positive; received ${shape}.`);
  if (shape < 1) return sampleGamma(shape + 1, random) * Math.pow(random(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // Marsaglia-Tsang accepts on well over 95% of proposals; a cap turns a
  // hypothetical non-terminating stream into a loud failure rather than a
  // hung test run.
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    let x: number;
    let v: number;
    do {
      x = standardNormal(random);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  throw new Error('gamma sampling failed to accept a proposal; the stream is degenerate.');
}

/** A Beta(a, b) variate as the standard ratio of two gamma variates. */
function sampleBeta(a: number, b: number, random: () => number): number {
  const x = sampleGamma(a, random);
  const y = sampleGamma(b, random);
  return x / (x + y);
}

/** The frozen specification of the clustered-coverage simulation. */
export interface ClusteredCoverageSpec {
  readonly rule: CertificationRule;
  /** The candidate's true MEAN rate across the organisation population. */
  readonly trueRate: number;
  readonly organisations: number;
  readonly itemsPerOrganisation: number;
  /** Between-organisation correlation of the truth being simulated. */
  readonly icc: number;
  readonly repetitions: number;
  readonly seed: number;
}

export interface ClusteredCoverageResult extends ClusteredCoverageSpec {
  /** Empirical P(accept) under the clustered truth. */
  readonly acceptanceProbability: number;
  /** P(accept) the same rule would have under INDEPENDENT items - the nominal figure. */
  readonly independentAcceptanceProbability: number;
}

/**
 * How often a certification rule accepts when the truth is CLUSTERED by
 * organisation rather than independent across pages.
 *
 * The point is not the number itself but the gap: a rule whose nominal
 * one-sided error rate is 0.05 under independence does NOT have a 0.05
 * error rate when pages within an organisation share a template, a
 * navigation scheme and an authoring convention. That gap is the entire
 * argument for computing the bound on a deflated denominator, and it is
 * measured here rather than asserted.
 *
 * ALGORITHM (frozen): each organisation draws its own true rate from a
 * Beta distribution with mean `trueRate` and the requested intraclass
 * correlation - sampled as the ratio of two Marsaglia-Tsang gamma variates
 * off a single mulberry32 stream - and each of its items is then an
 * independent Bernoulli draw at that organisation's rate. Seed and
 * repetition count are inputs, so any run is reproducible byte-for-byte.
 */
export function clusteredCoverage(spec: ClusteredCoverageSpec): ClusteredCoverageResult {
  const { rule, trueRate, organisations, itemsPerOrganisation, icc, repetitions, seed } = spec;
  assertCount(organisations, 'organisations');
  assertCount(itemsPerOrganisation, 'itemsPerOrganisation');
  assertCount(repetitions, 'repetitions');
  if (organisations === 0 || itemsPerOrganisation === 0 || repetitions === 0) {
    throw new Error('organisations, itemsPerOrganisation and repetitions must each be at least 1.');
  }
  if (!(icc > 0 && icc < 1)) throw new Error(`icc must be in (0, 1); received ${icc}.`);
  if (!(trueRate > 0 && trueRate < 1)) {
    throw new Error(`trueRate must be in (0, 1); received ${trueRate}.`);
  }
  const items = organisations * itemsPerOrganisation;
  if (items !== rule.denominator) {
    throw new Error(
      `the simulated item count (${items}) must equal the rule's denominator (${rule.denominator}).`,
    );
  }
  const boundary = certificationBoundary(rule);
  const a = (trueRate * (1 - icc)) / icc;
  const b = ((1 - trueRate) * (1 - icc)) / icc;
  const random = mulberry32(seed);
  let accepted = 0;
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    let successes = 0;
    for (let organisation = 0; organisation < organisations; organisation += 1) {
      const organisationRate = sampleBeta(a, b, random);
      for (let item = 0; item < itemsPerOrganisation; item += 1) {
        if (random() < organisationRate) successes += 1;
      }
    }
    if (boundary.criticalCount !== null) {
      const passes =
        rule.direction === 'higher is better'
          ? successes >= boundary.criticalCount
          : items - successes <= boundary.criticalCount;
      if (passes) accepted += 1;
    }
  }
  return {
    ...spec,
    acceptanceProbability: accepted / repetitions,
    independentAcceptanceProbability: certificationAcceptanceProbability(rule, trueRate),
  };
}

/**
 * The variance of a mean propensity estimated from `items` items at
 * `replicates` inferences each, decomposed into the part that belongs to
 * the SAMPLE and the part that belongs to MODEL STOCHASTICITY.
 *
 * `variance = (betweenItemVariance + withinItemVariance / replicates) / items`
 *
 * The consequence is the whole of the R1 answer on replication: at a FIXED
 * inference budget `items * replicates`, the expression becomes
 * `(replicates * betweenItemVariance + withinItemVariance) / budget`,
 * which is strictly increasing in `replicates`. Spending a fixed budget on
 * more ITEMS always beats spending it on more REPLICATES, for the quality
 * question - so N = 5 full replication cannot be justified as evidence,
 * only as a stability instrument.
 */
export function estimatorVarianceDecomposition(input: {
  readonly betweenItemVariance: number;
  readonly withinItemVariance: number;
  readonly items: number;
  readonly replicates: number;
}): {
  readonly sampleComponent: number;
  readonly stochasticComponent: number;
  readonly total: number;
  readonly inferenceBudget: number;
} {
  const { betweenItemVariance, withinItemVariance, items, replicates } = input;
  assertCount(items, 'items');
  assertCount(replicates, 'replicates');
  if (items === 0 || replicates === 0) throw new Error('items and replicates must be at least 1.');
  if (betweenItemVariance < 0 || withinItemVariance < 0) {
    throw new Error('variance components must be non-negative.');
  }
  const sampleComponent = betweenItemVariance / items;
  const stochasticComponent = withinItemVariance / (items * replicates);
  return {
    sampleComponent,
    stochasticComponent,
    total: sampleComponent + stochasticComponent,
    inferenceBudget: items * replicates,
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

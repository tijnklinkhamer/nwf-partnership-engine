/**
 * PHASE 2B-2D2C-F4 — EXACT INTEGER METRICS.
 *
 * Counts are the authoritative result; every rate is derived presentation
 * only, and a rate with a zero denominator is `null` — NEVER 0, which would
 * read as "measured, and bad" rather than "not measured".
 *
 * STRICT and CONDITIONAL denominators are computed by separate functions
 * over separate inputs so they cannot be accidentally mixed: a strict
 * denominator is every item, a conditional denominator is the accepted
 * items only, and each result carries its own denominator for reporting.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */

/** `null` when the denominator is 0 — an unmeasured rate is not a zero rate. */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new RangeError('rate takes exact integer counts.');
  }
  if (denominator < 0 || numerator < 0) throw new RangeError('counts may not be negative.');
  if (numerator > denominator) throw new RangeError('numerator may not exceed denominator.');
  return denominator === 0 ? null : numerator / denominator;
}

export interface FieldMetrics {
  readonly field: string;
  /** Every item the field could apply to — the strict denominator. */
  readonly support: number;
  readonly correct: number;
  readonly incorrect: number;
  /** Items excluded from the CONDITIONAL denominator (validator-rejected or unscorable). */
  readonly rejectedOrUnscorable: number;
  readonly strictDenominator: number;
  readonly strictAccuracy: number | null;
  readonly conditionalDenominator: number;
  readonly conditionalCorrect: number;
  readonly conditionalAccuracy: number | null;
  /** `gold -> predicted -> count`; predicted `null` is a rejected/absent answer. */
  readonly confusion: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface ClassMetrics {
  readonly className: string;
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
}

export interface TernaryMetrics {
  readonly classes: readonly ClassMetrics[];
  readonly macroF1: number | null;
  readonly confusion: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

export interface ScorableObservation {
  /** The gold value; a class name. */
  readonly gold: string;
  /** The predicted class, or `null` when the validator rejected the answer. */
  readonly predicted: string | null;
}

function emptyConfusion(
  classes: readonly string[],
  predictedClasses: readonly string[],
): Record<string, Record<string, number>> {
  const confusion: Record<string, Record<string, number>> = {};
  for (const gold of classes) {
    const row: Record<string, number> = {};
    for (const predicted of predictedClasses) row[predicted] = 0;
    confusion[gold] = row;
  }
  return confusion;
}

/**
 * Strict and conditional metrics for one field over one variant.
 *
 * `classes` is the field's EXACT schema vocabulary — never a collapsed one.
 * A rejected answer contributes `predicted: null`, which lands in the
 * `REJECTED` confusion column and counts INCORRECT in the strict view while
 * being excluded from the conditional denominator entirely.
 */
export function computeFieldMetrics(
  field: string,
  classes: readonly string[],
  observations: readonly ScorableObservation[],
): FieldMetrics {
  const predictedColumns = [...classes, 'REJECTED'];
  const confusion = emptyConfusion(classes, predictedColumns);
  let correct = 0;
  let incorrect = 0;
  let rejectedOrUnscorable = 0;
  let conditionalCorrect = 0;
  let conditionalDenominator = 0;
  for (const observation of observations) {
    const row = confusion[observation.gold];
    if (row === undefined) {
      throw new RangeError(`gold class ${observation.gold} is not in the field's vocabulary.`);
    }
    if (observation.predicted === null) {
      row['REJECTED'] = (row['REJECTED'] ?? 0) + 1;
      rejectedOrUnscorable += 1;
      incorrect += 1; // STRICT: unverifiable output is not a free pass.
      continue;
    }
    if (!classes.includes(observation.predicted)) {
      throw new RangeError(
        `predicted class ${observation.predicted} is not in the field's vocabulary.`,
      );
    }
    row[observation.predicted] = (row[observation.predicted] ?? 0) + 1;
    conditionalDenominator += 1;
    if (observation.predicted === observation.gold) {
      correct += 1;
      conditionalCorrect += 1;
    } else {
      incorrect += 1;
    }
  }
  const support = observations.length;
  return {
    field,
    support,
    correct,
    incorrect,
    rejectedOrUnscorable,
    strictDenominator: support,
    strictAccuracy: rate(correct, support),
    conditionalDenominator,
    conditionalCorrect,
    conditionalAccuracy: rate(conditionalCorrect, conditionalDenominator),
    confusion,
  };
}

/**
 * Per-class precision/recall/F1 and macro-F1 for a ternary axis, over the
 * CONDITIONAL observations only (a rejected answer has no predicted class,
 * so it can be a false negative but never a false positive).
 */
export function computeTernaryMetrics(
  classes: readonly string[],
  observations: readonly ScorableObservation[],
): TernaryMetrics {
  const confusion = emptyConfusion(classes, [...classes, 'REJECTED']);
  for (const observation of observations) {
    const row = confusion[observation.gold];
    if (row === undefined) throw new RangeError(`gold class ${observation.gold} is unknown.`);
    const column = observation.predicted ?? 'REJECTED';
    if (observation.predicted !== null && !classes.includes(observation.predicted)) {
      throw new RangeError(`predicted class ${observation.predicted} is unknown.`);
    }
    row[column] = (row[column] ?? 0) + 1;
  }
  const classMetrics = classes.map((className): ClassMetrics => {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    for (const observation of observations) {
      const predicted = observation.predicted;
      if (observation.gold === className && predicted === className) truePositives += 1;
      else if (observation.gold !== className && predicted === className) falsePositives += 1;
      else if (observation.gold === className && predicted !== className) falseNegatives += 1;
    }
    const precision = rate(truePositives, truePositives + falsePositives);
    const recall = rate(truePositives, truePositives + falseNegatives);
    const f1 =
      precision === null || recall === null || precision + recall === 0
        ? null
        : (2 * precision * recall) / (precision + recall);
    return { className, truePositives, falsePositives, falseNegatives, precision, recall, f1 };
  });
  const defined = classMetrics.map((c) => c.f1).filter((f): f is number => f !== null);
  return {
    classes: classMetrics,
    macroF1: defined.length === 0 ? null : defined.reduce((a, b) => a + b, 0) / defined.length,
    confusion,
  };
}

export interface McNemarResult {
  /** V1 correct, V2 incorrect. */
  readonly b: number;
  /** V1 incorrect, V2 correct. */
  readonly c: number;
  readonly discordant: number;
  /** Uncorrected chi-square on the discordant pairs; `null` when none exist. */
  readonly chiSquare: number | null;
  /** Always true here: a 49-item DEVELOPMENT set proves nothing about generalisation. */
  readonly exploratoryOnly: true;
}

/** The exact paired McNemar statistic over discordant correct/incorrect pairs. */
export function computeMcNemar(b: number, c: number): McNemarResult {
  if (!Number.isInteger(b) || !Number.isInteger(c) || b < 0 || c < 0) {
    throw new RangeError('McNemar takes non-negative integer discordant counts.');
  }
  const discordant = b + c;
  return {
    b,
    c,
    discordant,
    chiSquare: discordant === 0 ? null : (b - c) ** 2 / discordant,
    exploratoryOnly: true,
  };
}

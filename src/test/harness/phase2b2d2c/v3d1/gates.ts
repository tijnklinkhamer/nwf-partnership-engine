/**
 * PHASE 2B-2D2C-V3D1 — EXACT GATE ARITHMETIC AND DETERMINISTIC COUNTERFACTUALS.
 *
 * The thresholds are F0B's frozen values, passed IN by the caller (the
 * test reads them from the committed freeze); nothing here invents,
 * relaxes or re-tunes a bound. What this module computes is arithmetic
 * only: for every gate, the current numerator and denominator, the minimum
 * numerator that would meet the threshold, how many corrected items that
 * needs, and the headroom above a gate that already passes.
 *
 * A counterfactual here is ARITHMETIC over counts — "if these N items were
 * answered correctly, this gate would read X/Y" — and says NOTHING about
 * whether any prompt would in fact produce those answers. That is stated
 * once here and repeated in the audit so that no counterfactual is read as
 * a prediction of model behaviour.
 *
 * PURE. No filesystem, no network, no clock.
 */

export interface GateThresholds {
  readonly minSchemaValidSpanVerifiedRate: number;
  readonly minUnitPageRecall: number;
  readonly minUnitPagePrecision: number;
  readonly minUnitTypeAccuracy: number;
  readonly minHardNegativeRejection: number;
  readonly maxNeedsReviewRate: number;
}

/** The exact integer counts every frozen gate is computed from. */
export interface GateCounts {
  readonly items: number;
  readonly accepted: number;
  readonly unitPageGold: number;
  readonly unitPageRecalled: number;
  readonly unitPagePredicted: number;
  readonly unitPageCorrect: number;
  readonly unitTypeCorrect: number;
  readonly hardNegatives: number;
  readonly hardNegativesRejectedAsNonUnit: number;
  readonly needsReviewAnswered: number;
}

export interface GateArithmetic {
  readonly gate: keyof GateThresholds;
  readonly direction: 'MIN' | 'MAX';
  readonly threshold: number;
  readonly numerator: number;
  readonly denominator: number;
  readonly observed: number | null;
  readonly met: boolean | null;
  /** MIN gates: the smallest numerator that meets the threshold at this denominator. MAX gates: the largest numerator allowed. */
  readonly boundaryNumerator: number;
  /** MIN gates: corrected items needed to meet the gate (0 when met). MAX gates: 0 when met, else excess items. */
  readonly correctionsRequired: number;
  /** Items the gate could still lose (MIN) or gain (MAX) and remain met; 0 when the gate is exactly at its boundary or not met. */
  readonly headroom: number;
}

const EPSILON = 1e-9;

function minimumNumerator(threshold: number, denominator: number): number {
  return Math.ceil(threshold * denominator - EPSILON);
}

function maximumNumerator(threshold: number, denominator: number): number {
  return Math.floor(threshold * denominator + EPSILON);
}

function arithmetic(
  gate: keyof GateThresholds,
  direction: 'MIN' | 'MAX',
  threshold: number,
  numerator: number,
  denominator: number,
): GateArithmetic {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || numerator < 0) {
    throw new RangeError(`${gate}: counts must be non-negative integers`);
  }
  if (numerator > denominator) throw new RangeError(`${gate}: numerator exceeds denominator`);
  const observed = denominator === 0 ? null : numerator / denominator;
  if (direction === 'MIN') {
    const boundary = minimumNumerator(threshold, denominator);
    const met = observed === null ? null : observed >= threshold;
    return {
      gate,
      direction,
      threshold,
      numerator,
      denominator,
      observed,
      met,
      boundaryNumerator: boundary,
      correctionsRequired: Math.max(0, boundary - numerator),
      headroom: met === true ? numerator - boundary : 0,
    };
  }
  const boundary = maximumNumerator(threshold, denominator);
  const met = observed === null ? null : observed <= threshold;
  return {
    gate,
    direction,
    threshold,
    numerator,
    denominator,
    observed,
    met,
    boundaryNumerator: boundary,
    correctionsRequired: Math.max(0, numerator - boundary),
    headroom: met === true ? boundary - numerator : 0,
  };
}

/** Every frozen gate, computed exactly as the F4 summariser defines it (strict view). */
export function evaluateGates(
  counts: GateCounts,
  thresholds: GateThresholds,
): readonly GateArithmetic[] {
  return [
    arithmetic(
      'minSchemaValidSpanVerifiedRate',
      'MIN',
      thresholds.minSchemaValidSpanVerifiedRate,
      counts.accepted,
      counts.items,
    ),
    arithmetic(
      'minUnitPageRecall',
      'MIN',
      thresholds.minUnitPageRecall,
      counts.unitPageRecalled,
      counts.unitPageGold,
    ),
    arithmetic(
      'minUnitPagePrecision',
      'MIN',
      thresholds.minUnitPagePrecision,
      counts.unitPageCorrect,
      counts.unitPagePredicted,
    ),
    arithmetic(
      'minUnitTypeAccuracy',
      'MIN',
      thresholds.minUnitTypeAccuracy,
      counts.unitTypeCorrect,
      counts.unitPageGold,
    ),
    arithmetic(
      'minHardNegativeRejection',
      'MIN',
      thresholds.minHardNegativeRejection,
      counts.hardNegativesRejectedAsNonUnit,
      counts.hardNegatives,
    ),
    arithmetic(
      'maxNeedsReviewRate',
      'MAX',
      thresholds.maxNeedsReviewRate,
      counts.needsReviewAnswered,
      counts.items,
    ),
  ];
}

export function allGatesMet(gates: readonly GateArithmetic[]): boolean {
  return gates.every((gate) => gate.met === true);
}

export function failedGates(gates: readonly GateArithmetic[]): readonly (keyof GateThresholds)[] {
  return gates.filter((gate) => gate.met !== true).map((gate) => gate.gate);
}

/**
 * A deterministic counterfactual over COUNTS. Each field says how many
 * currently-missed items are assumed answered correctly (verdict, and for
 * gold UNIT_PAGE items also unit type); `additionalFalsePositives` adds
 * accepted UNIT_PAGE answers on non-UNIT_PAGE gold. Nothing here predicts
 * that a prompt would produce these answers.
 */
export interface Counterfactual {
  /** Gold UNIT_PAGE items currently accepted with a non-UNIT_PAGE verdict, assumed recovered with the correct unit type. */
  readonly recoverAnsweredUnitMisses?: number;
  /** Gold UNIT_PAGE items currently validator-rejected, assumed accepted as UNIT_PAGE with the correct unit type. */
  readonly recoverRejectedUnitPages?: number;
  /** Non-UNIT_PAGE gold items currently validator-rejected, assumed accepted with a correct NOT_A_UNIT verdict (hard-negative aware via the flag). */
  readonly recoverRejectedNonUnits?: { readonly count: number; readonly hardNegatives: number };
  /** Additional accepted UNIT_PAGE answers on non-UNIT_PAGE gold (the FP tolerance probe). */
  readonly additionalFalsePositives?: number;
}

export function applyCounterfactual(counts: GateCounts, scenario: Counterfactual): GateCounts {
  const answered = scenario.recoverAnsweredUnitMisses ?? 0;
  const rejectedUnits = scenario.recoverRejectedUnitPages ?? 0;
  const rejectedNonUnits = scenario.recoverRejectedNonUnits ?? { count: 0, hardNegatives: 0 };
  const falsePositives = scenario.additionalFalsePositives ?? 0;
  for (const value of [
    answered,
    rejectedUnits,
    rejectedNonUnits.count,
    rejectedNonUnits.hardNegatives,
    falsePositives,
  ]) {
    if (!Number.isInteger(value) || value < 0)
      throw new RangeError('counterfactual counts are non-negative integers');
  }
  const unitPageRecalled = counts.unitPageRecalled + answered + rejectedUnits;
  if (unitPageRecalled > counts.unitPageGold) {
    throw new RangeError('cannot recover more UNIT_PAGE items than the gold holds');
  }
  const accepted = counts.accepted + rejectedUnits + rejectedNonUnits.count;
  if (accepted > counts.items) throw new RangeError('cannot accept more items than exist');
  return {
    ...counts,
    accepted,
    unitPageRecalled,
    unitPagePredicted: counts.unitPagePredicted + answered + rejectedUnits + falsePositives,
    unitPageCorrect: counts.unitPageCorrect + answered + rejectedUnits,
    unitTypeCorrect: counts.unitTypeCorrect + answered + rejectedUnits,
    hardNegativesRejectedAsNonUnit:
      counts.hardNegativesRejectedAsNonUnit + rejectedNonUnits.hardNegatives,
  };
}

/** The largest number of additional UNIT_PAGE false positives the precision gate tolerates at these counts (0 when it already fails). */
export function maximumAdditionalFalsePositives(counts: GateCounts, threshold: number): number {
  let tolerated = 0;
  for (;;) {
    const probe = applyCounterfactual(counts, { additionalFalsePositives: tolerated + 1 });
    const precision = probe.unitPageCorrect / probe.unitPagePredicted;
    if (precision < threshold) return tolerated;
    tolerated += 1;
    if (tolerated > counts.items) throw new RangeError('unbounded false-positive tolerance');
  }
}

/** Removes ONE gold UNIT_PAGE item from every denominator it sits in — the F0B leave-one-out view, as arithmetic. */
export function leaveOneOutUnitPage(
  counts: GateCounts,
  item: {
    readonly accepted: boolean;
    readonly recalled: boolean;
    readonly unitTypeCorrect: boolean;
    readonly answeredNeedsReview: boolean;
  },
): GateCounts {
  return {
    items: counts.items - 1,
    accepted: counts.accepted - (item.accepted ? 1 : 0),
    unitPageGold: counts.unitPageGold - 1,
    unitPageRecalled: counts.unitPageRecalled - (item.recalled ? 1 : 0),
    unitPagePredicted: counts.unitPagePredicted - (item.recalled ? 1 : 0),
    unitPageCorrect: counts.unitPageCorrect - (item.recalled ? 1 : 0),
    unitTypeCorrect: counts.unitTypeCorrect - (item.unitTypeCorrect ? 1 : 0),
    hardNegatives: counts.hardNegatives,
    hardNegativesRejectedAsNonUnit: counts.hardNegativesRejectedAsNonUnit,
    needsReviewAnswered: counts.needsReviewAnswered - (item.answeredNeedsReview ? 1 : 0),
  };
}

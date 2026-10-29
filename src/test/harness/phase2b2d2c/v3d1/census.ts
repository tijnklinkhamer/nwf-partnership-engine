/**
 * PHASE 2B-2D2C-V3D1 — THE DETERMINISTIC FAILURE CENSUS.
 *
 * A pure function over the COMMITTED, post-adjudication scored rows
 * (`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-1-gold-v1-adjudicated/scored-items.jsonl`).
 * It reads nothing else: no preserved attempt root, no raw model output, no
 * rationale text, no provider, no database, no filesystem of its own. Every
 * number it produces must reconcile with the summary the G2 derivation
 * already committed, and the accompanying test asserts that it does.
 *
 * What the census adds over the scored rows is CLASSIFICATION, not new
 * measurement: for every DEVELOPMENT item it says which frozen gate the
 * item counts against under each prompt, whether the two prompts differ at
 * the top-level verdict, whether an axis difference is an independent axis
 * decision or is mechanically nulled by a non-unit verdict, and which of
 * the eight failure categories the item belongs to.
 *
 * DIAGNOSTIC ONLY. Nothing here implements a prompt, a classifier, a
 * validator change or a gold change.
 */
import type { FieldCorrectness, PredictionFields, ScoredItem } from '../scoring/score.js';

export const V3D1_CENSUS_VERSION = 'phase2b-2d2c-v3d1-failure-census-v1';

export const V1 = 'PROMPT_V1_CANONICAL';
export const V2 = 'PROMPT_V2_CANONICAL';

export const RELEVANCE_AXES = Object.freeze([
  'serves_incoming_international_students',
  'serves_outgoing_mobility_students',
  'provides_language_learning_or_support',
] as const);
export type RelevanceAxis = (typeof RELEVANCE_AXES)[number];

/** The frozen F0B gates an item can count AGAINST (or, for the capped gate, count TOWARD). */
export type GateName =
  | 'minSchemaValidSpanVerifiedRate'
  | 'minUnitPageRecall'
  | 'minUnitPagePrecision'
  | 'minUnitTypeAccuracy'
  | 'minHardNegativeRejection'
  | 'maxNeedsReviewRate';

export interface CensusVariantView {
  readonly validatorState: 'ACCEPTED' | 'REJECTED';
  readonly rejectionCategory: string | null;
  readonly rejectionReason: string | null;
  readonly rawOutputSha256: string | null;
  readonly prediction: PredictionFields | null;
  readonly fieldCorrectness: Readonly<Record<string, FieldCorrectness>>;
  /**
   * The gates this item's outcome under this variant counts against. For
   * the five `min*` gates that is "this item is a numerator miss"; for
   * `maxNeedsReviewRate` it is "this item is counted by the capped
   * numerator". Empty means the item contributes to no shortfall.
   */
  readonly countsAgainstGates: readonly GateName[];
}

export type AxisDifferenceClassification =
  'INDEPENDENT' | 'MECHANICALLY_NULLED_BY_NON_UNIT_VERDICT' | 'NOT_COMPARABLE_VALIDATOR_REJECTED';

export interface AxisDifference {
  readonly axis: RelevanceAxis;
  readonly gold: string | null;
  readonly v1: string | null;
  readonly v2: string | null;
  readonly v1Correctness: FieldCorrectness;
  readonly v2Correctness: FieldCorrectness;
  readonly classification: AxisDifferenceClassification;
}

export type VerdictState = 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW' | 'REJECTED';

export interface CensusRecord {
  readonly goldId: string;
  readonly corpusLineNumber: number;
  readonly echeRowKey: string;
  readonly logicalBatchOrdinal: number;
  readonly docIndex: number;
  readonly gold: Readonly<Record<string, string | null>>;
  readonly v1: CensusVariantView;
  readonly v2: CensusVariantView;
  readonly paired: {
    readonly v1Verdict: VerdictState;
    readonly v2Verdict: VerdictState;
    readonly verdictDiffers: boolean;
    readonly validityTransition: string;
    readonly verdictCorrectnessTransition: string;
    /**
     * Structured fields whose presence does not depend on the verdict and
     * which differ between the variants: today only `unit_name_present`.
     * Verdict-conditional fields (unit type, page kind, the three axes) are
     * excluded because, when the verdicts differ, their difference is
     * mechanical; `confidence` is a self-rating, not a scored field.
     */
    readonly verdictIndependentFieldDifferences: readonly string[];
    /** True when the verdicts differ AND no verdict-independent field differs — every field difference follows from the verdict. */
    readonly differenceCausedByTopLevelVerdict: boolean;
  };
  readonly axisDifferences: readonly AxisDifference[];
}

export interface AxisErrorRef {
  readonly goldId: string;
  readonly axis: RelevanceAxis;
  readonly gold: string | null;
  readonly predicted: string | null;
}

export interface VariantCategoryIds {
  readonly v1: readonly string[];
  readonly v2: readonly string[];
}

export interface FailureCensusCategories {
  /** Accepted, answered UNIT_PAGE, gold verdict is not UNIT_PAGE. */
  readonly falsePositiveUnits: VariantCategoryIds;
  /** Gold UNIT_PAGE, accepted, answered something other than UNIT_PAGE. */
  readonly falseNegativeUnitsAnswered: VariantCategoryIds;
  /** Gold UNIT_PAGE, validator-rejected (a strict recall miss). */
  readonly falseNegativeUnitsRejected: VariantCategoryIds;
  readonly validatorRejected: VariantCategoryIds & { readonly persistent: readonly string[] };
  /** An axis INCORRECT while the same variant's verdict was a correct UNIT_PAGE. */
  readonly independentAxisErrors: {
    readonly v1: readonly AxisErrorRef[];
    readonly v2: readonly AxisErrorRef[];
  };
  /** An axis INCORRECT only because the verdict was wrong or the item was rejected (gold UNIT_PAGE). */
  readonly axisErrorsCausedOnlyByIncorrectVerdict: {
    readonly v1: readonly AxisErrorRef[];
    readonly v2: readonly AxisErrorRef[];
  };
  /**
   * Items whose V2 verdict is correct and not UNIT_PAGE, but which carry
   * positive-shaped evidence a broader positive rule could flip: a hard
   * negative (a positive deterministic signal fired), or an item V1
   * answered UNIT_PAGE, or an item V1 could not answer verifiably.
   */
  readonly correctItemsAtRiskUnderBroaderPositiveRule: readonly string[];
}

export interface VariantReconciliation {
  readonly items: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly unitPageGold: number;
  readonly unitPageRecalled: number;
  readonly unitPagePredicted: number;
  readonly unitPageCorrect: number;
  readonly unitTypeCorrect: number;
  readonly hardNegatives: number;
  readonly hardNegativesRejectedAsNonUnit: number;
  readonly needsReviewAnswered: number;
  readonly needsReviewGold: number;
  readonly notAUnitGold: number;
  readonly notAUnitCorrect: number;
}

export interface FailureCensus {
  readonly censusVersion: string;
  readonly itemCount: number;
  readonly goldVerdictCounts: Readonly<Record<'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW', number>>;
  readonly records: readonly CensusRecord[];
  readonly categories: FailureCensusCategories;
  readonly reconciliation: {
    readonly v1: VariantReconciliation;
    readonly v2: VariantReconciliation;
  };
}

function verdictStateOf(row: ScoredItem): VerdictState {
  return row.prediction === null ? 'REJECTED' : row.prediction.verdict;
}

function countsAgainstGates(row: ScoredItem): readonly GateName[] {
  const gates: GateName[] = [];
  const goldVerdict = row.gold['verdict'];
  const accepted = row.prediction !== null;
  const verdict = row.prediction?.verdict ?? null;
  if (!accepted) gates.push('minSchemaValidSpanVerifiedRate');
  if (goldVerdict === 'UNIT_PAGE' && verdict !== 'UNIT_PAGE') gates.push('minUnitPageRecall');
  if (accepted && verdict === 'UNIT_PAGE' && goldVerdict !== 'UNIT_PAGE') {
    gates.push('minUnitPagePrecision');
  }
  if (
    goldVerdict === 'UNIT_PAGE' &&
    !(
      accepted &&
      row.prediction?.unit_type !== null &&
      row.prediction?.unit_type === row.gold['unit_type']
    )
  ) {
    gates.push('minUnitTypeAccuracy');
  }
  if (row.gold['hard_negative'] === 'HARD_NEGATIVE' && !(accepted && verdict === 'NOT_A_UNIT')) {
    gates.push('minHardNegativeRejection');
  }
  if (accepted && verdict === 'NEEDS_REVIEW') gates.push('maxNeedsReviewRate');
  return gates;
}

function variantViewOf(row: ScoredItem): CensusVariantView {
  return {
    validatorState: row.validatorState,
    rejectionCategory: row.rejectionCategory,
    rejectionReason: row.rejectionReason,
    rawOutputSha256: row.rawOutputSha256,
    prediction: row.prediction,
    fieldCorrectness: row.fieldCorrectness,
    countsAgainstGates: countsAgainstGates(row),
  };
}

function validityTransitionOf(v1: ScoredItem, v2: ScoredItem): string {
  return `${v1.validatorState}_TO_${v2.validatorState}`;
}

function correctnessTransitionOf(v1: ScoredItem, v2: ScoredItem): string {
  const c1 = v1.fieldCorrectness['verdict'] === 'CORRECT' ? 'CORRECT' : 'INCORRECT';
  const c2 = v2.fieldCorrectness['verdict'] === 'CORRECT' ? 'CORRECT' : 'INCORRECT';
  return `${c1}_TO_${c2}`;
}

function axisValue(row: ScoredItem, axis: RelevanceAxis): string | null {
  return row.prediction === null ? null : row.prediction[axis];
}

function axisDifferencesOf(v1: ScoredItem, v2: ScoredItem): readonly AxisDifference[] {
  const differences: AxisDifference[] = [];
  for (const axis of RELEVANCE_AXES) {
    const a = axisValue(v1, axis);
    const b = axisValue(v2, axis);
    const c1 = v1.fieldCorrectness[axis] ?? 'GOLD_UNAVAILABLE';
    const c2 = v2.fieldCorrectness[axis] ?? 'GOLD_UNAVAILABLE';
    if (a === b && c1 === c2) continue;
    let classification: AxisDifferenceClassification;
    if (v1.prediction === null || v2.prediction === null) {
      classification = 'NOT_COMPARABLE_VALIDATOR_REJECTED';
    } else if (
      (v1.prediction.verdict === 'UNIT_PAGE') !==
      (v2.prediction.verdict === 'UNIT_PAGE')
    ) {
      classification = 'MECHANICALLY_NULLED_BY_NON_UNIT_VERDICT';
    } else {
      classification = 'INDEPENDENT';
    }
    differences.push({
      axis,
      gold: v1.gold[axis] ?? null,
      v1: a,
      v2: b,
      v1Correctness: c1,
      v2Correctness: c2,
      classification,
    });
  }
  return differences;
}

/** The verdict-independent structured fields on which the two accepted answers differ. */
function verdictIndependentDifferences(v1: ScoredItem, v2: ScoredItem): readonly string[] {
  if (v1.prediction === null || v2.prediction === null) return [];
  const differences: string[] = [];
  if (v1.prediction.unit_name_present !== v2.prediction.unit_name_present) {
    differences.push('unit_name_present');
  }
  return differences;
}

function reconciliationOf(rows: readonly ScoredItem[]): VariantReconciliation {
  const unitPageGold = rows.filter((r) => r.gold['verdict'] === 'UNIT_PAGE');
  const hardNegatives = rows.filter((r) => r.gold['hard_negative'] === 'HARD_NEGATIVE');
  const notAUnitGold = rows.filter((r) => r.gold['verdict'] === 'NOT_A_UNIT');
  const answered = (r: ScoredItem, verdict: string): boolean =>
    r.prediction !== null && r.prediction.verdict === verdict;
  return {
    items: rows.length,
    accepted: rows.filter((r) => r.prediction !== null).length,
    rejected: rows.filter((r) => r.prediction === null).length,
    unitPageGold: unitPageGold.length,
    unitPageRecalled: unitPageGold.filter((r) => answered(r, 'UNIT_PAGE')).length,
    unitPagePredicted: rows.filter((r) => answered(r, 'UNIT_PAGE')).length,
    unitPageCorrect: unitPageGold.filter((r) => answered(r, 'UNIT_PAGE')).length,
    unitTypeCorrect: unitPageGold.filter((r) => r.fieldCorrectness['unit_type'] === 'CORRECT')
      .length,
    hardNegatives: hardNegatives.length,
    hardNegativesRejectedAsNonUnit: hardNegatives.filter((r) => answered(r, 'NOT_A_UNIT')).length,
    needsReviewAnswered: rows.filter((r) => answered(r, 'NEEDS_REVIEW')).length,
    needsReviewGold: rows.filter((r) => r.gold['verdict'] === 'NEEDS_REVIEW').length,
    notAUnitGold: notAUnitGold.length,
    notAUnitCorrect: notAUnitGold.filter((r) => answered(r, 'NOT_A_UNIT')).length,
  };
}

function pairRows(rows: readonly ScoredItem[]): readonly [ScoredItem, ScoredItem][] {
  const byId = new Map<string, { v1?: ScoredItem; v2?: ScoredItem }>();
  for (const row of rows) {
    const entry = byId.get(row.goldId) ?? {};
    if (row.variantName === V1) {
      if (entry.v1) throw new RangeError(`duplicate ${V1} row for ${row.goldId}`);
      entry.v1 = row;
    } else if (row.variantName === V2) {
      if (entry.v2) throw new RangeError(`duplicate ${V2} row for ${row.goldId}`);
      entry.v2 = row;
    } else {
      throw new RangeError(`unknown variant ${String(row.variantName)} for ${row.goldId}`);
    }
    byId.set(row.goldId, entry);
  }
  const pairs: [ScoredItem, ScoredItem][] = [];
  for (const [goldId, entry] of [...byId.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!entry.v1 || !entry.v2) throw new RangeError(`${goldId} is missing a variant row`);
    if (entry.v1.gold['verdict'] === null || entry.v1.gold['verdict'] === undefined) {
      throw new RangeError(`${goldId} carries no gold verdict; the census needs gold-backed rows`);
    }
    pairs.push([entry.v1, entry.v2]);
  }
  return pairs;
}

function axisErrorsOf(
  pairs: readonly [ScoredItem, ScoredItem][],
  pick: (pair: [ScoredItem, ScoredItem]) => ScoredItem,
  independent: boolean,
): readonly AxisErrorRef[] {
  const refs: AxisErrorRef[] = [];
  for (const pair of pairs) {
    const row = pick(pair);
    if (row.gold['verdict'] !== 'UNIT_PAGE') continue;
    const verdictCorrect = row.prediction !== null && row.prediction.verdict === 'UNIT_PAGE';
    if (verdictCorrect !== independent) continue;
    for (const axis of RELEVANCE_AXES) {
      if (row.fieldCorrectness[axis] === 'INCORRECT') {
        refs.push({
          goldId: row.goldId,
          axis,
          gold: row.gold[axis] ?? null,
          predicted: axisValue(row, axis),
        });
      }
    }
  }
  return refs;
}

/** Builds the census from the 98 committed, gold-backed scored rows (49 items x 2 variants). */
export function buildFailureCensus(rows: readonly ScoredItem[]): FailureCensus {
  const pairs = pairRows(rows);
  const records: CensusRecord[] = pairs.map(([v1, v2]) => {
    const verdictDiffers = verdictStateOf(v1) !== verdictStateOf(v2);
    const independent = verdictIndependentDifferences(v1, v2);
    return {
      goldId: v1.goldId,
      corpusLineNumber: v1.corpusLineNumber,
      echeRowKey: v1.echeRowKey,
      logicalBatchOrdinal: v1.logicalBatchOrdinal,
      docIndex: v1.docIndex,
      gold: v1.gold,
      v1: variantViewOf(v1),
      v2: variantViewOf(v2),
      paired: {
        v1Verdict: verdictStateOf(v1),
        v2Verdict: verdictStateOf(v2),
        verdictDiffers,
        validityTransition: validityTransitionOf(v1, v2),
        verdictCorrectnessTransition: correctnessTransitionOf(v1, v2),
        verdictIndependentFieldDifferences: independent,
        differenceCausedByTopLevelVerdict: verdictDiffers && independent.length === 0,
      },
      axisDifferences: axisDifferencesOf(v1, v2),
    };
  });

  const ids = (predicate: (v1: ScoredItem, v2: ScoredItem) => boolean): readonly string[] =>
    pairs.filter(([a, b]) => predicate(a, b)).map(([a]) => a.goldId);
  const isFalsePositive = (r: ScoredItem): boolean =>
    r.prediction !== null &&
    r.prediction.verdict === 'UNIT_PAGE' &&
    r.gold['verdict'] !== 'UNIT_PAGE';
  const isAnsweredFalseNegative = (r: ScoredItem): boolean =>
    r.gold['verdict'] === 'UNIT_PAGE' &&
    r.prediction !== null &&
    r.prediction.verdict !== 'UNIT_PAGE';
  const isRejectedUnit = (r: ScoredItem): boolean =>
    r.gold['verdict'] === 'UNIT_PAGE' && r.prediction === null;

  const v1Rows = pairs.map(([a]) => a);
  const v2Rows = pairs.map(([, b]) => b);
  const goldVerdictCounts = {
    UNIT_PAGE: v1Rows.filter((r) => r.gold['verdict'] === 'UNIT_PAGE').length,
    NOT_A_UNIT: v1Rows.filter((r) => r.gold['verdict'] === 'NOT_A_UNIT').length,
    NEEDS_REVIEW: v1Rows.filter((r) => r.gold['verdict'] === 'NEEDS_REVIEW').length,
  };

  const categories: FailureCensusCategories = {
    falsePositiveUnits: {
      v1: ids((a) => isFalsePositive(a)),
      v2: ids((_, b) => isFalsePositive(b)),
    },
    falseNegativeUnitsAnswered: {
      v1: ids((a) => isAnsweredFalseNegative(a)),
      v2: ids((_, b) => isAnsweredFalseNegative(b)),
    },
    falseNegativeUnitsRejected: {
      v1: ids((a) => isRejectedUnit(a)),
      v2: ids((_, b) => isRejectedUnit(b)),
    },
    validatorRejected: {
      v1: ids((a) => a.prediction === null),
      v2: ids((_, b) => b.prediction === null),
      persistent: ids((a, b) => a.prediction === null && b.prediction === null),
    },
    independentAxisErrors: {
      v1: axisErrorsOf(pairs, ([a]) => a, true),
      v2: axisErrorsOf(pairs, ([, b]) => b, true),
    },
    axisErrorsCausedOnlyByIncorrectVerdict: {
      v1: axisErrorsOf(pairs, ([a]) => a, false),
      v2: axisErrorsOf(pairs, ([, b]) => b, false),
    },
    correctItemsAtRiskUnderBroaderPositiveRule: ids(
      (a, b) =>
        b.gold['verdict'] !== 'UNIT_PAGE' &&
        b.fieldCorrectness['verdict'] === 'CORRECT' &&
        (b.gold['hard_negative'] === 'HARD_NEGATIVE' ||
          a.prediction === null ||
          a.prediction.verdict === 'UNIT_PAGE'),
    ),
  };

  return {
    censusVersion: V3D1_CENSUS_VERSION,
    itemCount: pairs.length,
    goldVerdictCounts,
    records,
    categories,
    reconciliation: { v1: reconciliationOf(v1Rows), v2: reconciliationOf(v2Rows) },
  };
}

/** Parses the committed `scored-items.jsonl` text into rows. Pure: takes the text, not a path. */
export function parseScoredItemsJsonl(text: string): readonly ScoredItem[] {
  return text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ScoredItem);
}

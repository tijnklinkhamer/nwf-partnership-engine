/**
 * PHASE 2B-2D2C-F0H — THE DETERMINISTIC ATTEMPT-2 FAILURE CENSUS.
 *
 * A pure function over the COMMITTED attempt-2 scored rows
 * (`docs/evaluation/results/phase2b-2d2c-dev-attribution-attempt-2-gold-v1-adjudicated/scored-items.jsonl`)
 * plus, only for the repair-artifact hash pointer, the already-verified
 * per-document repair records the attempt-2 scoring loader produces from
 * the immutable attempt-2 root. It reads no raw model output, no
 * rationale text, no evidence quote text and no chain of thought — only
 * verdicts, unit types, validator states and SHA-256 pointers.
 *
 * One row per DEVELOPMENT gold id (49 rows), joining the three variants
 * (V1, V2, V3) by goldId. Every gate-contribution flag it derives is
 * cross-checked by the accompanying test against the six frozen gate
 * numerators the committed attempt-2 summary already reports — this
 * module adds CLASSIFICATION and RECONCILIATION, not new measurement.
 *
 * DIAGNOSTIC ONLY. Implements no prompt, classifier, validator or gold
 * change.
 */
import type { ScoredItem } from '../scoring/score.js';

export const F0H_CENSUS_VERSION = 'phase2b-2d2c-f0h-attempt2-failure-census-v1';

export const V1 = 'PROMPT_V1_CANONICAL';
export const V2 = 'PROMPT_V2_CANONICAL';
export const V3 = 'PROMPT_V3_CANONICAL';

export type GateName =
  | 'minSchemaValidSpanVerifiedRate'
  | 'minUnitPageRecall'
  | 'minUnitPagePrecision'
  | 'minUnitTypeAccuracy'
  | 'minHardNegativeRejection'
  | 'maxNeedsReviewRate';

export interface RepairPointer {
  readonly round: 1;
  readonly category: string;
  readonly disposition: string;
  /** Artifact-kind -> SHA-256, from the already-verified attempt-2 loader. No content. */
  readonly artifactFileSha256: Readonly<Record<string, string>>;
}

export interface VariantView {
  readonly verdict: string | null;
  readonly validatorState: 'ACCEPTED' | 'REJECTED';
  readonly unitType: string | null;
}

export type Transition =
  'UNCHANGED' | 'VALIDITY_RECOVERED' | 'VALIDITY_LOST' | `${string}_TO_${string}`;

export interface CensusItem {
  readonly goldId: string;
  readonly echeRowKey: string;
  readonly corpusLineNumber: number;
  readonly gold: {
    readonly verdict: string;
    readonly unitType: string | null;
    readonly hardNegative: string;
  };
  readonly v1: VariantView;
  readonly v2: VariantView;
  readonly v3: {
    readonly firstPassValidatorState: 'ACCEPTED' | 'REJECTED';
    readonly firstPassVerdict: string | null;
    readonly postRepairValidatorState: 'ACCEPTED' | 'REJECTED';
    readonly postRepairVerdict: string | null;
    readonly unitType: string | null;
    readonly rejectionCategory: string | null;
    readonly rawArtifactSha256: string;
    readonly repair: RepairPointer | null;
  };
  readonly transitions: {
    readonly v2ToV3: Transition;
    readonly v1ToV3: Transition;
  };
  readonly gateContribution: {
    readonly minSchemaValidSpanVerifiedRate_miss: boolean;
    readonly minUnitPageRecall_miss: boolean;
    readonly minUnitPagePrecision_falsePositive: boolean;
    readonly minUnitTypeAccuracy_miss: boolean;
    readonly minHardNegativeRejection_failure: boolean;
    readonly maxNeedsReviewRate_contributor: boolean;
  };
  readonly outcomeClass:
    | 'TRUE_POSITIVE'
    | 'FALSE_POSITIVE'
    | 'FALSE_NEGATIVE'
    | 'TRUE_NEGATIVE'
    | 'NEEDS_REVIEW_ON_UNIT_PAGE'
    | 'NEEDS_REVIEW_ON_NEGATIVE';
  readonly repairedEvidenceItem: boolean;
  readonly correctedV2FalseNegative: boolean;
  readonly v2ToV3Regression: boolean;
}

export interface GateReconciliation {
  readonly gate: GateName;
  readonly denominator: number;
  readonly numeratorFailures: number;
  readonly failingGoldIds: readonly string[];
  readonly observed: number;
}

export interface FailureCensus {
  readonly version: typeof F0H_CENSUS_VERSION;
  readonly itemCount: number;
  readonly items: readonly CensusItem[];
  readonly reconciliation: readonly GateReconciliation[];
  readonly summary: {
    readonly truePositives: readonly string[];
    readonly falsePositives: readonly string[];
    readonly falseNegatives: readonly string[];
    readonly needsReviewOnUnitPage: readonly string[];
    readonly needsReviewOnNegative: readonly string[];
    readonly hardNegativeRegressions: readonly string[];
    readonly ordinaryNegativeRegressions: readonly string[];
    readonly correctedV2FalseNegatives: readonly string[];
    readonly v2ToV3Regressions: readonly string[];
    readonly repairedItems: readonly string[];
  };
}

function verdictOf(row: ScoredItem): string | null {
  return row.validatorState === 'ACCEPTED' ? (row.prediction?.verdict ?? null) : null;
}
function unitTypeOf(row: ScoredItem): string | null {
  return row.validatorState === 'ACCEPTED' ? (row.prediction?.unit_type ?? null) : null;
}
function view(row: ScoredItem): VariantView {
  return { verdict: verdictOf(row), validatorState: row.validatorState, unitType: unitTypeOf(row) };
}

function transitionOf(from: ScoredItem, to: ScoredItem): Transition {
  const fromV = verdictOf(from);
  const toV = verdictOf(to);
  if (from.validatorState === to.validatorState && fromV === toV) return 'UNCHANGED';
  if (from.validatorState === 'REJECTED' && to.validatorState === 'ACCEPTED')
    return 'VALIDITY_RECOVERED';
  if (from.validatorState === 'ACCEPTED' && to.validatorState === 'REJECTED')
    return 'VALIDITY_LOST';
  return `${fromV ?? 'REJECTED'}_TO_${toV ?? 'REJECTED'}`;
}

/**
 * Builds the 49-item census. `repairsByGoldId` carries only the repair
 * pointer (artifact-kind -> SHA-256, category, disposition) for goldIds
 * whose V3 evaluation had a repair round; absent for every item without
 * one.
 */
export function buildAttempt2FailureCensus(
  v1Rows: readonly ScoredItem[],
  v2Rows: readonly ScoredItem[],
  v3Rows: readonly ScoredItem[],
  repairsByGoldId: ReadonlyMap<string, RepairPointer>,
): FailureCensus {
  const byGoldId = <T extends { goldId: string }>(rows: readonly T[]): Map<string, T> => {
    const map = new Map<string, T>();
    for (const row of rows) {
      if (map.has(row.goldId)) throw new Error(`duplicate goldId ${row.goldId} in row set.`);
      map.set(row.goldId, row);
    }
    return map;
  };
  const v1ByGoldId = byGoldId(v1Rows);
  const v2ByGoldId = byGoldId(v2Rows);
  const v3ByGoldId = byGoldId(v3Rows);
  const goldIds = [...v3ByGoldId.keys()].sort();
  if (goldIds.length !== v1ByGoldId.size || goldIds.length !== v2ByGoldId.size) {
    throw new Error('V1/V2/V3 row sets do not cover the same gold ids.');
  }

  const items: CensusItem[] = [];
  for (const goldId of goldIds) {
    const v1Row = v1ByGoldId.get(goldId);
    const v2Row = v2ByGoldId.get(goldId);
    const v3Row = v3ByGoldId.get(goldId);
    if (v1Row === undefined || v2Row === undefined || v3Row === undefined) {
      throw new Error(`goldId ${goldId} missing from one variant's row set.`);
    }
    const gold = v3Row.gold;
    const goldVerdict = String(gold['verdict']);
    const goldUnitType = (gold['unit_type'] as string | null) ?? null;
    const goldHardNegative = String(gold['hard_negative']);
    const isHardNegative = goldHardNegative === 'HARD_NEGATIVE';

    const repair = repairsByGoldId.get(goldId) ?? null;
    const v3PostVerdict = verdictOf(v3Row);
    const v3PostState = v3Row.validatorState;
    const v3FirstPassState: 'ACCEPTED' | 'REJECTED' = repair !== null ? 'REJECTED' : v3PostState;
    const v3FirstPassVerdict = repair !== null ? null : v3PostVerdict;

    const minUnitPageRecallMiss = goldVerdict === 'UNIT_PAGE' && v3PostVerdict !== 'UNIT_PAGE';
    const minUnitPagePrecisionFP = goldVerdict !== 'UNIT_PAGE' && v3PostVerdict === 'UNIT_PAGE';
    const minUnitTypeAccuracyMiss =
      goldVerdict === 'UNIT_PAGE' &&
      v3PostState === 'ACCEPTED' &&
      unitTypeOf(v3Row) !== goldUnitType;
    const minHardNegativeRejectionFailure = isHardNegative && v3PostVerdict !== 'NOT_A_UNIT';
    const maxNeedsReviewContributor = v3PostVerdict === 'NEEDS_REVIEW';
    const schemaMiss = v3PostState !== 'ACCEPTED';

    let outcomeClass: CensusItem['outcomeClass'];
    if (goldVerdict === 'UNIT_PAGE' && v3PostVerdict === 'UNIT_PAGE')
      outcomeClass = 'TRUE_POSITIVE';
    else if (goldVerdict === 'UNIT_PAGE' && v3PostVerdict === 'NEEDS_REVIEW')
      outcomeClass = 'NEEDS_REVIEW_ON_UNIT_PAGE';
    else if (goldVerdict === 'UNIT_PAGE') outcomeClass = 'FALSE_NEGATIVE';
    else if (v3PostVerdict === 'UNIT_PAGE') outcomeClass = 'FALSE_POSITIVE';
    else if (v3PostVerdict === 'NEEDS_REVIEW') outcomeClass = 'NEEDS_REVIEW_ON_NEGATIVE';
    else outcomeClass = 'TRUE_NEGATIVE';

    const v2ToV3 = transitionOf(v2Row, v3Row);
    const v1ToV3 = transitionOf(v1Row, v3Row);

    const correctedV2FalseNegative =
      goldVerdict === 'UNIT_PAGE' &&
      verdictOf(v2Row) !== 'UNIT_PAGE' &&
      v3PostVerdict === 'UNIT_PAGE';
    const v2WasCorrect =
      (goldVerdict === 'UNIT_PAGE' && verdictOf(v2Row) === 'UNIT_PAGE') ||
      (goldVerdict !== 'UNIT_PAGE' && verdictOf(v2Row) === 'NOT_A_UNIT');
    const v3WasIncorrect =
      minUnitPagePrecisionFP || minHardNegativeRejectionFailure || minUnitPageRecallMiss;
    const v2ToV3Regression = v2WasCorrect && v3WasIncorrect;

    items.push({
      goldId,
      echeRowKey: v3Row.echeRowKey,
      corpusLineNumber: v3Row.corpusLineNumber,
      gold: { verdict: goldVerdict, unitType: goldUnitType, hardNegative: goldHardNegative },
      v1: view(v1Row),
      v2: view(v2Row),
      v3: {
        firstPassValidatorState: v3FirstPassState,
        firstPassVerdict: v3FirstPassVerdict,
        postRepairValidatorState: v3PostState,
        postRepairVerdict: v3PostVerdict,
        unitType: unitTypeOf(v3Row),
        rejectionCategory: v3Row.rejectionCategory,
        rawArtifactSha256: v3Row.finalRecordSha256,
        repair,
      },
      transitions: { v2ToV3, v1ToV3 },
      gateContribution: {
        minSchemaValidSpanVerifiedRate_miss: schemaMiss,
        minUnitPageRecall_miss: minUnitPageRecallMiss,
        minUnitPagePrecision_falsePositive: minUnitPagePrecisionFP,
        minUnitTypeAccuracy_miss: minUnitTypeAccuracyMiss,
        minHardNegativeRejection_failure: minHardNegativeRejectionFailure,
        maxNeedsReviewRate_contributor: maxNeedsReviewContributor,
      },
      outcomeClass,
      repairedEvidenceItem: repair !== null,
      correctedV2FalseNegative,
      v2ToV3Regression,
    });
  }

  /**
   * `min*` gates report the SUCCESS rate (1 - failures/denominator);
   * `maxNeedsReviewRate` reports the capped rate itself
   * (failures/denominator) — it is the thing being bounded, not its
   * complement. Confirmed against the committed attempt-2 summary by the
   * accompanying test.
   */
  const gateOf = (
    name: GateName,
    denominator: number,
    pick: (i: CensusItem) => boolean,
  ): GateReconciliation => {
    const failing = items.filter(pick).map((i) => i.goldId);
    const rate = denominator === 0 ? 0 : failing.length / denominator;
    const observed = name === 'maxNeedsReviewRate' ? rate : denominator === 0 ? 1 : 1 - rate;
    return {
      gate: name,
      denominator,
      numeratorFailures: failing.length,
      failingGoldIds: failing,
      observed: Number(observed.toFixed(10)),
    };
  };

  const unitPageDenominator = items.filter((i) => i.v3.postRepairVerdict === 'UNIT_PAGE').length;
  const goldUnitPageDenominator = items.filter((i) => i.gold.verdict === 'UNIT_PAGE').length;
  const hardNegativeDenominator = items.filter(
    (i) => i.gold.hardNegative === 'HARD_NEGATIVE',
  ).length;
  const totalItems = items.length;

  const reconciliation: readonly GateReconciliation[] = [
    gateOf(
      'minSchemaValidSpanVerifiedRate',
      totalItems,
      (i) => i.gateContribution.minSchemaValidSpanVerifiedRate_miss,
    ),
    gateOf(
      'minUnitPageRecall',
      goldUnitPageDenominator,
      (i) => i.gateContribution.minUnitPageRecall_miss,
    ),
    gateOf(
      'minUnitPagePrecision',
      unitPageDenominator,
      (i) => i.gateContribution.minUnitPagePrecision_falsePositive,
    ),
    gateOf(
      'minUnitTypeAccuracy',
      goldUnitPageDenominator,
      (i) => i.gateContribution.minUnitTypeAccuracy_miss,
    ),
    gateOf(
      'minHardNegativeRejection',
      hardNegativeDenominator,
      (i) => i.gateContribution.minHardNegativeRejection_failure,
    ),
    gateOf(
      'maxNeedsReviewRate',
      totalItems,
      (i) => i.gateContribution.maxNeedsReviewRate_contributor,
    ),
  ];

  const pickIds = (predicate: (i: CensusItem) => boolean): readonly string[] =>
    items.filter(predicate).map((i) => i.goldId);

  return {
    version: F0H_CENSUS_VERSION,
    itemCount: totalItems,
    items,
    reconciliation,
    summary: {
      truePositives: pickIds((i) => i.outcomeClass === 'TRUE_POSITIVE'),
      falsePositives: pickIds((i) => i.outcomeClass === 'FALSE_POSITIVE'),
      falseNegatives: pickIds((i) => i.outcomeClass === 'FALSE_NEGATIVE'),
      needsReviewOnUnitPage: pickIds((i) => i.outcomeClass === 'NEEDS_REVIEW_ON_UNIT_PAGE'),
      needsReviewOnNegative: pickIds((i) => i.outcomeClass === 'NEEDS_REVIEW_ON_NEGATIVE'),
      hardNegativeRegressions: pickIds(
        (i) => i.gold.hardNegative === 'HARD_NEGATIVE' && i.v2ToV3Regression,
      ),
      ordinaryNegativeRegressions: pickIds(
        (i) =>
          i.gold.verdict === 'NOT_A_UNIT' &&
          i.gold.hardNegative !== 'HARD_NEGATIVE' &&
          i.v2ToV3Regression,
      ),
      correctedV2FalseNegatives: pickIds((i) => i.correctedV2FalseNegative),
      v2ToV3Regressions: pickIds((i) => i.v2ToV3Regression),
      repairedItems: pickIds((i) => i.repairedEvidenceItem),
    },
  };
}

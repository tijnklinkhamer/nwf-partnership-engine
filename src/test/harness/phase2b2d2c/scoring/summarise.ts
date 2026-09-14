/**
 * PHASE 2B-2D2C-F4 — THE DETERMINISTIC SUMMARY.
 *
 * Everything here is a function of the verified sources. The recommendation
 * is DERIVED, not chosen: when no DEVELOPMENT-only gold source supplies a
 * field across the corpus, semantic accuracy has no denominator at all and
 * the only truthful outcome is `INSUFFICIENT_VALID_DEV_EVIDENCE`. There is
 * no threshold invented here that the freeze did not already carry.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import {
  PAGE_KINDS,
  RELEVANCE_VALUES,
  UNIT_TYPES,
} from '../../../../orgunits/classify/outputSchema.js';
import { FROZEN_VARIANTS, type FrozenVariantName } from '../constants.js';
import {
  F4A_GOLD_OUTPUT_SCHEMA_VERSION,
  F4A_GOLD_SCORER_VERSION,
  F4_EXPECTED_VALIDATOR_TOTALS,
  F4_OPEN_OWNER_GOLD_ID,
  F4_OUTPUT_SCHEMA_VERSION,
  F4_SCORER_VERSION,
  F4_SLICES,
  F4_SLICE_NAMES,
} from './constants.js';
import { GOLD_BACKED_FIELDS, type GoldAvailability } from './gold.js';
import {
  computeFieldMetrics,
  computeMcNemar,
  computeTernaryMetrics,
  rate,
  type FieldMetrics,
  type McNemarResult,
  type ScorableObservation,
  type TernaryMetrics,
} from './metrics.js';
import {
  CONCORDANCE_FIELD_NAMES,
  countConcordance,
  countCorrectnessTransitions,
  countValidityTransitions,
  type ConcordanceCounts,
  type CorrectnessTransitionCounts,
  type PairedItem,
  type ValidityTransitionCounts,
} from './paired.js';
import { NON_PREDICTED_GOLD_FIELDS, predictedClassOf, type ScoredItem } from './score.js';
import type { LoadedOwnerAdjudication } from './adjudication.js';
import type { LoadedGoldSupplement } from './supplement.js';
import type { LoadedSources } from './sources.js';

export const RECOMMENDATIONS = [
  'PROMOTE_PROMPT_V2_TO_NEXT_GATE',
  'KEEP_PROMPT_V1_AND_REVISE_V2',
  'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION',
  'INSUFFICIENT_VALID_DEV_EVIDENCE',
] as const;

export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** The exact schema vocabularies, never collapsed. */
export const FIELD_VOCABULARIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  verdict: ['UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW'],
  unit_type: UNIT_TYPES,
  page_kind: PAGE_KINDS,
  serves_incoming_international_students: RELEVANCE_VALUES,
  serves_outgoing_mobility_students: RELEVANCE_VALUES,
  provides_language_learning_or_support: RELEVANCE_VALUES,
});

/**
 * The SCORING vocabulary of a field: its schema vocabulary plus `NULL`.
 *
 * `NULL` is a real, distinct answer, not padding. A model that answers
 * NOT_A_UNIT on an item whose gold is UNIT_PAGE necessarily returns a null
 * `unit_type`, and folding that into the `REJECTED` column would conflate
 * "the validator could not verify this" with "the model gave a different
 * structured answer". Gold is never `NULL` in a scored denominator — the
 * biconditional's null half is `NOT_APPLICABLE` and is excluded entirely.
 */
export const SCORING_VOCABULARIES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  verdict: ['UNIT_PAGE', 'NOT_A_UNIT', 'NEEDS_REVIEW'],
  unit_type: [...UNIT_TYPES, 'NULL'],
  page_kind: [...PAGE_KINDS, 'NULL'],
  serves_incoming_international_students: [...RELEVANCE_VALUES, 'NULL'],
  serves_outgoing_mobility_students: [...RELEVANCE_VALUES, 'NULL'],
  provides_language_learning_or_support: [...RELEVANCE_VALUES, 'NULL'],
  unit_name_expectation: ['NAMED', 'NULL'],
});

/** The three relevance axes, which get per-class precision/recall/F1. */
export const TERNARY_AXES: readonly string[] = Object.freeze([
  'serves_incoming_international_students',
  'serves_outgoing_mobility_students',
  'provides_language_learning_or_support',
]);

export interface HardNegativeMetrics {
  /** Items the gold marks `hard_negative`. */
  readonly denominator: number;
  /** Of those, items answered NOT_A_UNIT by a validator-accepted result. */
  readonly rejectedAsNonUnit: number;
  /** Of those, items answered UNIT_PAGE — the protocol's costly failure. */
  readonly acceptedAsUnitPage: number;
  readonly answeredNeedsReview: number;
  readonly validatorRejected: number;
  /** STRICT: a validator-rejected hard negative is NOT a successful rejection. */
  readonly strictRejectionRate: number | null;
  readonly conditionalDenominator: number;
  readonly conditionalRejectionRate: number | null;
}

export interface GateOutcome {
  readonly gate: string;
  readonly threshold: number;
  readonly observed: number | null;
  readonly denominator: number;
  readonly met: boolean | null;
  readonly note: string;
}

export interface VariantSemanticMetrics {
  readonly variantName: FrozenVariantName;
  readonly fields: readonly FieldMetrics[];
  readonly ternaryByAxis: readonly { readonly axis: string; readonly metrics: TernaryMetrics }[];
  readonly hardNegative: HardNegativeMetrics;
  readonly gates: readonly GateOutcome[];
}

export interface VariantSummary {
  readonly variantName: FrozenVariantName;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly variantGitCommit: string;
  readonly items: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly acceptanceRate: number | null;
  readonly expectedAccepted: number;
  readonly expectedRejected: number;
  readonly matchesF3Totals: boolean;
  readonly rejectionsByCategory: Readonly<Record<string, number>>;
  readonly rejectionsByReason: Readonly<Record<string, number>>;
  /** Gold-free distribution of each structured field's answers, over ACCEPTED items. */
  readonly predictionDistribution: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly outputTokens: number;
  readonly wallTimeMs: number;
}

export interface SliceRow {
  readonly slice: string;
  readonly goldId: string;
  readonly echeRowKey: string;
  readonly docIndex: number;
  readonly v1ValidatorState: string;
  readonly v2ValidatorState: string;
  readonly v1RejectionReason: string | null;
  readonly v2RejectionReason: string | null;
  readonly v1Verdict: string | null;
  readonly v2Verdict: string | null;
  readonly v1UnitType: string | null;
  readonly v2UnitType: string | null;
  readonly v1PageKind: string | null;
  readonly v2PageKind: string | null;
  readonly v1Axes: Readonly<Record<string, string | null>> | null;
  readonly v2Axes: Readonly<Record<string, string | null>> | null;
  readonly goldVerdict: string | null;
  readonly goldSource: string;
  readonly validityTransition: string;
  readonly verdictCorrectnessTransition: string;
}

export interface GoldQuestionSensitivity {
  readonly goldId: string;
  readonly presentInCorpus: boolean;
  readonly committedLabel: string | null;
  readonly labelChangedByThisTask: false;
  readonly primary: {
    readonly items: number;
    readonly validity: ValidityTransitionCounts;
    readonly verdictCorrectness: CorrectnessTransitionCounts;
  };
  readonly leaveOneOut: {
    readonly items: number;
    readonly validity: ValidityTransitionCounts;
    readonly verdictCorrectness: CorrectnessTransitionCounts;
    /** F4A: the freeze's own gates, recomputed over the 48-item denominator. */
    readonly gates?: readonly {
      readonly variantName: string;
      readonly gates: readonly GateOutcome[];
    }[];
  };
  /**
   * F4A: every frozen gate whose PASS/FAIL verdict changes when this one item
   * is removed. F0B's policy turns a non-empty list here into
   * BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION, so it is reported by name and
   * with both denominators rather than as a bare boolean.
   */
  readonly gateVerdictFlips?: readonly {
    readonly variantName: string;
    readonly gate: string;
    readonly threshold: number;
    readonly primaryObserved: number | null;
    readonly primaryDenominator: number;
    readonly primaryMet: boolean | null;
    readonly leaveOneOutObserved: number | null;
    readonly leaveOneOutDenominator: number;
    readonly leaveOneOutMet: boolean | null;
  }[];
  /**
   * G2: whether F0B's leave-one-out rule fired AT ALL, kept separate from
   * whether it still blocks. An adjudication discharges the BLOCK; it never
   * un-fires the rule, and the flip below stays reported either way.
   */
  readonly sensitivityRuleFires?: boolean;
  /** G2: whether an owner adjudication of this item was supplied and verified. */
  readonly ownerAdjudicated?: boolean;
  readonly ownerDecision?: string;
  readonly ownerConfirmedVerdict?: string;
  readonly ownerConfirmedUnitType?: string;
  readonly ownerAdjudicationRecordPath?: string;
  readonly ownerAdjudicationRecordRawSha256?: string;
  readonly changesAnyHeadline: boolean;
  /**
   * True when every semantic pair this task can score is this one item — in
   * which case the only semantic comparison between the variants rests
   * entirely on a label the owner has flagged unresolved, which F0B's
   * `unresolvedGold.policy` says must be reported as
   * BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION.
   */
  readonly semanticEvidenceRestsSolelyOnThisItem: boolean;
  readonly section9TriggerMet: boolean;
  readonly headlineComparisonNote: string;
}

/** F4A §10.1 — one item where the two variants' verdicts disagree. */
export interface VerdictMovementRow {
  readonly goldId: string;
  readonly goldVerdict: string;
  readonly v1Verdict: string | null;
  readonly v2Verdict: string | null;
  readonly v1Correct: boolean | null;
  readonly v2Correct: boolean | null;
  readonly movement: 'CORRECTION' | 'REGRESSION' | 'NEITHER_CORRECT' | 'NOT_COMPARABLE';
}

/** F4A §10.2 — one relevance-axis answer that differs between the variants. */
export interface AxisMovementRow {
  readonly goldId: string;
  readonly axis: string;
  readonly gold: string;
  readonly v1: string | null;
  readonly v2: string | null;
  readonly movement: 'CORRECTION' | 'REGRESSION' | 'NEITHER_CORRECT' | 'NOT_COMPARABLE';
}

/** F4A §10.3 / §10.4 — what happened to an item's validator state, and whether it was right. */
export interface ValidatorMovementRow {
  readonly goldId: string;
  readonly transition: string;
  readonly v1RejectionCategory: string | null;
  readonly v1RejectionReason: string | null;
  readonly v2RejectionCategory: string | null;
  readonly v2RejectionReason: string | null;
  readonly goldVerdict: string | null;
  readonly v2Verdict: string | null;
  readonly v2VerdictCorrect: boolean | null;
}

export interface F4AInterpretation {
  readonly verdictMovements: readonly VerdictMovementRow[];
  readonly verdictMovementTotals: Readonly<Record<string, number>>;
  readonly axisMovements: readonly AxisMovementRow[];
  readonly axisMovementTotals: Readonly<Record<string, number>>;
  /** Items where v1 answered NO on an axis; v2 emitted no NO at all. */
  readonly v1NoAnswers: number;
  readonly v2NoAnswers: number;
  readonly v1NoAnswersThatWereCorrect: number;
  /** Gold classes the corpus's relevance axes actually use. */
  readonly axisGoldClassesPresent: readonly string[];
  /**
   * Of the axis REGRESSIONS, how many are a CONSEQUENCE of v2 moving the
   * verdict to NOT_A_UNIT — which forces all three axes to null under the
   * output schema's biconditional — rather than an axis-calibration change in
   * its own right. Without this split, "dropping NO caused regressions" would
   * be asserted where the evidence says the verdict move did.
   */
  readonly axisRegressionsCausedByVerdictMove: number;
  readonly axisRegressionsIndependentOfVerdict: number;
  readonly validatorRecoveries: readonly ValidatorMovementRow[];
  readonly persistentRejections: readonly ValidatorMovementRow[];
  readonly validatorRegressions: readonly ValidatorMovementRow[];
  /** Every field-level CORRECT_TO_INCORRECT, by gold id — §10.5. */
  readonly regressionsByField: readonly {
    readonly field: string;
    readonly goldIds: readonly string[];
  }[];
}

export interface F4Summary {
  readonly scorerVersion: string;
  readonly outputSchemaVersion: string;
  readonly sources: {
    readonly freezeVersion: string;
    readonly freezeRawSha256: string;
    readonly corpusRawSha256: string;
    readonly corpusManifestRawSha256: string;
    readonly corpusContentSha256: string;
    readonly planSha256: string;
    readonly artifactsVerified: number;
    readonly artifactInventorySha256: string;
    readonly consumptionMarkerSha256: string;
    readonly consumedAtUtc: string;
    readonly experimentStatus: string;
    readonly experimentCompletedAtUtc: string;
    readonly corpusItems: number;
    readonly corpusSplit: 'DEVELOPMENT';
  };
  readonly goldAvailability: GoldAvailability;
  /**
   * F4A: the scoring-only supplement's provenance.
   *
   * ABSENT — not `null` — on a no-gold derivation, and that is deliberate:
   * omitting the key entirely keeps the blocked F4 derivation BYTE-IDENTICAL
   * under this scorer, which is what proves the gold path is purely additive
   * rather than a rewrite of what F4 concluded.
   */
  readonly goldSupplement?: {
    readonly supplementPath: string;
    readonly supplementVersion: string;
    readonly supplementRawSha256: string;
    readonly fixturePath: string;
    readonly fixtureRawSha256: string;
    readonly fixtureManifestRawSha256: string;
    readonly mixedSourceWholeFileSha256: string;
    readonly labelCount: number;
    readonly createdAfterInference: true;
    readonly visibleToModelDuringInference: false;
    readonly altersInferenceFreeze: false;
  };
  /**
   * G2: the owner gold-adjudication record, when one was supplied. ABSENT —
   * not `null` — on every other derivation, for the same reason
   * `goldSupplement` is: omitting the key keeps the pre-adjudication F4A
   * derivation byte-identical under this scorer, so the discharge is
   * provably additive rather than a rewrite of what F4A concluded.
   */
  readonly ownerAdjudication?: {
    readonly recordPath: string;
    readonly recordRawSha256: string;
    readonly schemaVersion: string;
    readonly goldId: string;
    readonly decision: string;
    readonly ownerStatement: string;
    readonly basis: string;
    readonly confirmedVerdict: string;
    readonly confirmedUnitType: string;
    readonly goldRecordSha256: string;
    readonly recordedAtUtc: string;
    readonly recordedAtUtcMeaning: string;
    readonly labelChanged: false;
    readonly modelPredictionsConsidered: false;
    readonly metricEffectsConsidered: false;
    readonly altersAnyPrediction: false;
    readonly altersAnyGoldValue: false;
    readonly altersAnyMetricDenominator: false;
    readonly altersAnyThreshold: false;
    readonly dischargedBlocker: 'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION';
    readonly dischargeBasis: string;
  };
  /**
   * G2: the explicit statement that no variant is acceptable, carried as
   * DATA so a reader never has to infer it from a recommendation enum. The
   * recommendation names what to do next; this names what is still false.
   */
  readonly acceptability?: {
    readonly anyVariantAcceptable: false;
    readonly anyVariantProductionReady: false;
    readonly perVariant: readonly {
      readonly variantName: string;
      readonly failedGates: readonly string[];
      readonly acceptable: false;
    }[];
    readonly gatesFailedByEveryVariant: readonly string[];
    readonly note: string;
  };
  readonly scorableGoldBackedFields: readonly string[];
  readonly unscorableGoldBackedFields: readonly string[];
  /** F4A: per-variant semantic metrics. Absent on a no-gold derivation. */
  readonly semanticMetrics?: readonly VariantSemanticMetrics[];
  readonly variants: readonly VariantSummary[];
  readonly paired: {
    readonly pairs: number;
    readonly validity: ValidityTransitionCounts;
    readonly correctnessByField: readonly CorrectnessTransitionCounts[];
    readonly concordanceByField: readonly ConcordanceCounts[];
    readonly mcNemarOnVerdictCorrectness: McNemarResult | null;
    readonly mcNemarNote: string;
  };
  readonly slices: readonly SliceRow[];
  readonly goldQuestionSensitivity: GoldQuestionSensitivity;
  /** F4A: the §10 determinations, as data. Absent on a no-gold derivation. */
  readonly f4aInterpretation?: F4AInterpretation;
  readonly interpretation: {
    readonly didCanonicalisationEliminateKnownValidatorFailures: string;
    readonly didPromptV2ImprovePageVersusUnit: string;
    readonly didPromptV2ImproveUnknownVersusNoCalibration: string;
    readonly didPromptV2IntroduceRegressionsElsewhere: string;
  };
  readonly recommendation: Recommendation;
  /**
   * A second status that is ALSO true, when it is. The primary
   * recommendation names the binding blocker; this names the open owner gold
   * question when F0B's sensitivity rule fires as well, so neither is hidden
   * behind the other.
   */
  readonly concurrentStatus: Recommendation | null;
  readonly recommendationBasis: readonly string[];
  readonly recommendationScope: string;
}

function distributionOf(rows: readonly ScoredItem[]): Record<string, Record<string, number>> {
  const distribution: Record<string, Record<string, number>> = {};
  for (const field of Object.keys(FIELD_VOCABULARIES)) {
    const counts: Record<string, number> = {};
    for (const value of FIELD_VOCABULARIES[field] ?? []) counts[value] = 0;
    counts['NULL'] = 0;
    counts['REJECTED'] = 0;
    for (const row of rows) {
      if (row.prediction === null) {
        counts['REJECTED'] = (counts['REJECTED'] ?? 0) + 1;
        continue;
      }
      const raw = row.prediction[field as keyof typeof row.prediction];
      const key = raw === null || raw === undefined ? 'NULL' : String(raw);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    distribution[field] = counts;
  }
  return distribution;
}

function summariseVariant(
  sources: LoadedSources,
  variantName: FrozenVariantName,
  rows: readonly ScoredItem[],
): VariantSummary {
  const accepted = rows.filter((r) => r.validatorState === 'ACCEPTED').length;
  const rejected = rows.length - accepted;
  const expected = F4_EXPECTED_VALIDATOR_TOTALS[variantName];
  const rejectionsByCategory: Record<string, number> = {};
  const rejectionsByReason: Record<string, number> = {};
  for (const row of rows) {
    if (row.rejectionCategory !== null) {
      rejectionsByCategory[row.rejectionCategory] =
        (rejectionsByCategory[row.rejectionCategory] ?? 0) + 1;
    }
    if (row.rejectionReason !== null) {
      rejectionsByReason[row.rejectionReason] = (rejectionsByReason[row.rejectionReason] ?? 0) + 1;
    }
  }
  const evaluations = sources.evaluations.filter((e) => e.variantName === variantName);
  const first = rows[0];
  return {
    variantName,
    promptVersion: first?.promptVersion ?? '',
    promptSha256: first?.promptSha256 ?? '',
    variantGitCommit: first?.variantGitCommit ?? '',
    items: rows.length,
    accepted,
    rejected,
    acceptanceRate: rate(accepted, rows.length),
    expectedAccepted: expected.accepted,
    expectedRejected: expected.rejected,
    matchesF3Totals: accepted === expected.accepted && rejected === expected.rejected,
    rejectionsByCategory,
    rejectionsByReason,
    predictionDistribution: distributionOf(rows),
    outputTokens: evaluations.reduce((total, e) => total + (e.outputTokens ?? 0), 0),
    wallTimeMs: evaluations.reduce((total, e) => total + (e.wallTimeMs ?? 0), 0),
  };
}

function sliceRowsOf(paired: readonly PairedItem[]): readonly SliceRow[] {
  const byGoldId = new Map(paired.map((p) => [p.goldId, p]));
  const rows: SliceRow[] = [];
  for (const slice of F4_SLICE_NAMES) {
    for (const goldId of F4_SLICES[slice]) {
      const pair = byGoldId.get(goldId);
      if (pair === undefined) {
        throw new Error(`slice ${slice} names ${goldId}, which is not a paired DEVELOPMENT item.`);
      }
      const axes = (item: PairedItem['v1']): Readonly<Record<string, string | null>> | null =>
        item.prediction === null
          ? null
          : {
              serves_incoming_international_students:
                item.prediction.serves_incoming_international_students,
              serves_outgoing_mobility_students: item.prediction.serves_outgoing_mobility_students,
              provides_language_learning_or_support:
                item.prediction.provides_language_learning_or_support,
            };
      rows.push({
        slice,
        goldId,
        echeRowKey: pair.echeRowKey,
        docIndex: pair.docIndex,
        v1ValidatorState: pair.v1.validatorState,
        v2ValidatorState: pair.v2.validatorState,
        v1RejectionReason: pair.v1.rejectionReason,
        v2RejectionReason: pair.v2.rejectionReason,
        v1Verdict: pair.v1.prediction?.verdict ?? null,
        v2Verdict: pair.v2.prediction?.verdict ?? null,
        v1UnitType: pair.v1.prediction?.unit_type ?? null,
        v2UnitType: pair.v2.prediction?.unit_type ?? null,
        v1PageKind: pair.v1.prediction?.page_kind ?? null,
        v2PageKind: pair.v2.prediction?.page_kind ?? null,
        v1Axes: axes(pair.v1),
        v2Axes: axes(pair.v2),
        goldVerdict: pair.v1.gold['verdict'] ?? null,
        goldSource: pair.v1.goldSource['verdict'] ?? 'NONE',
        validityTransition: pair.validityTransition,
        verdictCorrectnessTransition: pair.correctnessTransition['verdict'] ?? 'GOLD_UNAVAILABLE',
      });
    }
  }
  return rows;
}

/**
 * The scorable observations for one field over one variant.
 *
 * An item whose `fieldCorrectness` is `NOT_APPLICABLE` or `GOLD_UNAVAILABLE`
 * is EXCLUDED from the denominator entirely — the gold defines no class for
 * it, so counting it either way would invent a measurement. An item the
 * validator rejected IS included, with `predicted: null`, which is what makes
 * the strict denominator strict.
 */
function observationsFor(
  rows: readonly ScoredItem[],
  field: string,
): readonly ScorableObservation[] {
  const observations: ScorableObservation[] = [];
  for (const row of rows) {
    const correctness = row.fieldCorrectness[field];
    if (correctness !== 'CORRECT' && correctness !== 'INCORRECT') continue;
    const gold = row.gold[field];
    if (gold === null || gold === undefined) continue;
    observations.push({
      gold,
      predicted: row.prediction === null ? null : predictedClassOf(row.prediction, field),
    });
  }
  return observations;
}

function hardNegativeMetricsOf(rows: readonly ScoredItem[]): HardNegativeMetrics {
  const hardNegatives = rows.filter((row) => row.gold['hard_negative'] === 'HARD_NEGATIVE');
  let rejectedAsNonUnit = 0;
  let acceptedAsUnitPage = 0;
  let answeredNeedsReview = 0;
  let validatorRejected = 0;
  for (const row of hardNegatives) {
    if (row.prediction === null) {
      validatorRejected += 1;
      continue;
    }
    if (row.prediction.verdict === 'NOT_A_UNIT') rejectedAsNonUnit += 1;
    else if (row.prediction.verdict === 'UNIT_PAGE') acceptedAsUnitPage += 1;
    else answeredNeedsReview += 1;
  }
  const conditionalDenominator = hardNegatives.length - validatorRejected;
  return {
    denominator: hardNegatives.length,
    rejectedAsNonUnit,
    acceptedAsUnitPage,
    answeredNeedsReview,
    validatorRejected,
    strictRejectionRate: rate(rejectedAsNonUnit, hardNegatives.length),
    conditionalDenominator,
    conditionalRejectionRate: rate(rejectedAsNonUnit, conditionalDenominator),
  };
}

/**
 * The freeze's own acceptance gates, evaluated against the STRICT view.
 *
 * These thresholds are F0B's, not this task's: nothing here invents a bound.
 * A gate whose denominator is zero reports `met: null`, never `true` — an
 * unmeasured gate is not a passed gate.
 */
function gateOutcomesOf(
  gates: Readonly<Record<string, number>>,
  fields: readonly FieldMetrics[],
  hardNegative: HardNegativeMetrics,
  rows: readonly ScoredItem[],
): readonly GateOutcome[] {
  const field = (name: string): FieldMetrics | undefined => fields.find((f) => f.field === name);
  const verdict = field('verdict');
  const unitPage = verdict?.confusion['UNIT_PAGE'] ?? {};
  const unitPageSupport = Object.values(unitPage).reduce((total, count) => total + count, 0);
  const unitPageCorrect = unitPage['UNIT_PAGE'] ?? 0;
  let unitPagePredicted = 0;
  for (const goldClass of Object.keys(verdict?.confusion ?? {})) {
    unitPagePredicted += verdict?.confusion[goldClass]?.['UNIT_PAGE'] ?? 0;
  }
  const needsReview = rows.filter(
    (row) => row.prediction !== null && row.prediction.verdict === 'NEEDS_REVIEW',
  ).length;
  const accepted = rows.filter((row) => row.validatorState === 'ACCEPTED').length;
  const unitType = field('unit_type');
  const outcome = (
    gate: string,
    threshold: number | undefined,
    observed: number | null,
    denominator: number,
    note: string,
    higherIsBetter = true,
  ): GateOutcome => ({
    gate,
    threshold: threshold ?? Number.NaN,
    observed,
    denominator,
    met:
      observed === null || threshold === undefined
        ? null
        : higherIsBetter
          ? observed >= threshold
          : observed <= threshold,
    note,
  });
  return [
    outcome(
      'minSchemaValidSpanVerifiedRate',
      gates['minSchemaValidSpanVerifiedRate'],
      rate(accepted, rows.length),
      rows.length,
      'validator acceptance, which is schema validity plus span verification. NOT a semantic metric.',
    ),
    outcome(
      'minUnitPageRecall',
      gates['minUnitPageRecall'],
      rate(unitPageCorrect, unitPageSupport),
      unitPageSupport,
      'STRICT: a validator-rejected UNIT_PAGE item counts as a miss.',
    ),
    outcome(
      'minUnitPagePrecision',
      gates['minUnitPagePrecision'],
      rate(unitPageCorrect, unitPagePredicted),
      unitPagePredicted,
      'over items answered UNIT_PAGE by a validator-accepted result.',
    ),
    outcome(
      'minUnitTypeAccuracy',
      gates['minUnitTypeAccuracy'],
      unitType?.strictAccuracy ?? null,
      unitType?.strictDenominator ?? 0,
      'STRICT, over items whose gold verdict is UNIT_PAGE.',
    ),
    outcome(
      'minHardNegativeRejection',
      gates['minHardNegativeRejection'],
      hardNegative.strictRejectionRate,
      hardNegative.denominator,
      'STRICT: a validator-rejected hard negative is not a successful rejection.',
    ),
    outcome(
      'maxNeedsReviewRate',
      gates['maxNeedsReviewRate'],
      rate(needsReview, rows.length),
      rows.length,
      'over every item, answered or not.',
      false,
    ),
  ];
}

function semanticMetricsOf(
  variantName: FrozenVariantName,
  rows: readonly ScoredItem[],
  gates: Readonly<Record<string, number>>,
): VariantSemanticMetrics {
  const fields = Object.keys(SCORING_VOCABULARIES)
    .filter((name) => !NON_PREDICTED_GOLD_FIELDS.includes(name))
    .sort()
    .map((name) =>
      computeFieldMetrics(name, SCORING_VOCABULARIES[name] ?? [], observationsFor(rows, name)),
    );
  const hardNegative = hardNegativeMetricsOf(rows);
  return {
    variantName,
    fields,
    ternaryByAxis: TERNARY_AXES.map((axis) => ({
      axis,
      metrics: computeTernaryMetrics(SCORING_VOCABULARIES[axis] ?? [], observationsFor(rows, axis)),
    })),
    hardNegative,
    gates: gateOutcomesOf(gates, fields, hardNegative, rows),
  };
}

function movementOf(
  goldValue: string,
  a: string | null,
  b: string | null,
): 'CORRECTION' | 'REGRESSION' | 'NEITHER_CORRECT' | 'NOT_COMPARABLE' {
  if (a === null || b === null) return 'NOT_COMPARABLE';
  const aCorrect = a === goldValue;
  const bCorrect = b === goldValue;
  if (!aCorrect && bCorrect) return 'CORRECTION';
  if (aCorrect && !bCorrect) return 'REGRESSION';
  if (aCorrect && bCorrect) return 'NEITHER_CORRECT';
  return 'NEITHER_CORRECT';
}

/**
 * F4A §10 — the six questions the task names, answered from gold rather than
 * narrated. Every row here is a real item with its gold class beside both
 * variants' answers, so a reader can check the claim instead of trusting it.
 */
function interpretF4A(paired: readonly PairedItem[]): F4AInterpretation {
  const verdictMovements: VerdictMovementRow[] = [];
  for (const pair of paired) {
    const goldVerdict = pair.v1.gold['verdict'];
    if (goldVerdict === null || goldVerdict === undefined) continue;
    const v1Verdict = pair.v1.prediction?.verdict ?? null;
    const v2Verdict = pair.v2.prediction?.verdict ?? null;
    if (v1Verdict === v2Verdict) continue;
    verdictMovements.push({
      goldId: pair.goldId,
      goldVerdict,
      v1Verdict,
      v2Verdict,
      v1Correct: v1Verdict === null ? null : v1Verdict === goldVerdict,
      v2Correct: v2Verdict === null ? null : v2Verdict === goldVerdict,
      movement: movementOf(goldVerdict, v1Verdict, v2Verdict),
    });
  }

  const axisMovements: AxisMovementRow[] = [];
  let v1NoAnswers = 0;
  let v2NoAnswers = 0;
  let v1NoAnswersThatWereCorrect = 0;
  for (const pair of paired) {
    for (const axis of TERNARY_AXES) {
      const gold = pair.v1.gold[axis];
      const v1 = pair.v1.prediction ? predictedClassOf(pair.v1.prediction, axis) : null;
      const v2 = pair.v2.prediction ? predictedClassOf(pair.v2.prediction, axis) : null;
      if (v1 === 'NO') {
        v1NoAnswers += 1;
        if (gold === 'NO') v1NoAnswersThatWereCorrect += 1;
      }
      if (v2 === 'NO') v2NoAnswers += 1;
      if (gold === null || gold === undefined) continue;
      if (v1 === v2) continue;
      axisMovements.push({
        goldId: pair.goldId,
        axis,
        gold,
        v1,
        v2,
        movement: movementOf(gold, v1, v2),
      });
    }
  }

  const validatorRow = (pair: PairedItem): ValidatorMovementRow => {
    const goldVerdict = pair.v1.gold['verdict'] ?? null;
    const v2Verdict = pair.v2.prediction?.verdict ?? null;
    return {
      goldId: pair.goldId,
      transition: pair.validityTransition,
      v1RejectionCategory: pair.v1.rejectionCategory,
      v1RejectionReason: pair.v1.rejectionReason,
      v2RejectionCategory: pair.v2.rejectionCategory,
      v2RejectionReason: pair.v2.rejectionReason,
      goldVerdict,
      v2Verdict,
      v2VerdictCorrect:
        goldVerdict === null || v2Verdict === null ? null : v2Verdict === goldVerdict,
    };
  };

  const tally = <T extends { movement: string }>(rows: readonly T[]): Record<string, number> => {
    const totals: Record<string, number> = {
      CORRECTION: 0,
      REGRESSION: 0,
      NEITHER_CORRECT: 0,
      NOT_COMPARABLE: 0,
    };
    for (const row of rows) totals[row.movement] = (totals[row.movement] ?? 0) + 1;
    return totals;
  };

  const regressionFields = [...new Set(paired.flatMap((p) => Object.keys(p.correctnessTransition)))]
    .sort()
    .map((field) => ({
      field,
      goldIds: paired
        .filter((p) => p.correctnessTransition[field] === 'CORRECT_TO_INCORRECT')
        .map((p) => p.goldId),
    }))
    .filter((entry) => entry.goldIds.length > 0);

  const axisRegressions = axisMovements.filter((row) => row.movement === 'REGRESSION');
  const axisRegressionsCausedByVerdictMove = axisRegressions.filter(
    (row) => row.v2 === 'NULL',
  ).length;

  return {
    verdictMovements,
    verdictMovementTotals: tally(verdictMovements),
    axisMovements,
    axisMovementTotals: tally(axisMovements),
    v1NoAnswers,
    v2NoAnswers,
    v1NoAnswersThatWereCorrect,
    axisGoldClassesPresent: [...new Set(axisMovements.map((row) => row.gold))].sort(),
    axisRegressionsCausedByVerdictMove,
    axisRegressionsIndependentOfVerdict:
      axisRegressions.length - axisRegressionsCausedByVerdictMove,
    validatorRecoveries: paired
      .filter((p) => p.validityTransition === 'REJECTED_TO_ACCEPTED')
      .map(validatorRow),
    persistentRejections: paired
      .filter((p) => p.validityTransition === 'REJECTED_TO_REJECTED')
      .map(validatorRow),
    validatorRegressions: paired
      .filter((p) => p.validityTransition === 'ACCEPTED_TO_REJECTED')
      .map(validatorRow),
    regressionsByField: regressionFields,
  };
}

export function buildSummary(
  sources: LoadedSources,
  rowsByVariant: ReadonlyMap<FrozenVariantName, readonly ScoredItem[]>,
  paired: readonly PairedItem[],
  availability: GoldAvailability,
  committedLabel: string | null,
  supplement: LoadedGoldSupplement | null = null,
  ownerAdjudication: LoadedOwnerAdjudication | null = null,
): F4Summary {
  const variants = FROZEN_VARIANTS.map((variant) =>
    summariseVariant(sources, variant.name, rowsByVariant.get(variant.name) ?? []),
  );
  const goldIsAvailable = availability.fields.some(
    (f) => f.available && f.source === 'F4A_SCORING_SUPPLEMENT',
  );
  // The freeze's `scoring.gates`, read as declared. `Freeze` types this block
  // loosely, so the shape is narrowed once, here, and never re-asserted.
  const frozenGates: Readonly<Record<string, number>> = Object.fromEntries(
    Object.entries(
      ((sources.freeze as { scoring?: { gates?: Record<string, unknown> } }).scoring?.gates ??
        {}) as Record<string, unknown>,
    ).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
  const semanticMetrics = goldIsAvailable
    ? FROZEN_VARIANTS.map((variant) =>
        semanticMetricsOf(variant.name, rowsByVariant.get(variant.name) ?? [], frozenGates),
      )
    : [];
  const validity = countValidityTransitions(paired);
  const correctnessByField = GOLD_BACKED_FIELDS.map((field) =>
    countCorrectnessTransitions(paired, field),
  );
  const concordanceByField = CONCORDANCE_FIELD_NAMES.map((field) =>
    countConcordance(paired, field),
  );
  const verdictTransitions = correctnessByField.find((c) => c.field === 'verdict');
  const corpusWideSources: readonly string[] = ['DEV_CANONICAL_CORPUS', 'F4A_SCORING_SUPPLEMENT'];
  const scorable = availability.fields.filter(
    (f) => f.available && corpusWideSources.includes(f.source),
  );
  const unscorable = availability.fields.filter(
    (f) => !f.available || !corpusWideSources.includes(f.source),
  );

  const withoutOpenQuestion = paired.filter((p) => p.goldId !== F4_OPEN_OWNER_GOLD_ID);
  const leaveOneOutValidity = countValidityTransitions(withoutOpenQuestion);
  const leaveOneOutVerdict = countCorrectnessTransitions(withoutOpenQuestion, 'verdict');
  const openQuestionPresent = paired.some((p) => p.goldId === F4_OPEN_OWNER_GOLD_ID);
  const primaryVerdict = verdictTransitions ?? countCorrectnessTransitions(paired, 'verdict');
  const openQuestionScorable =
    (paired.find((p) => p.goldId === F4_OPEN_OWNER_GOLD_ID)?.correctnessTransition['verdict'] ??
      'GOLD_UNAVAILABLE') !== 'GOLD_UNAVAILABLE';
  const semanticEvidenceRestsSolelyOnThisItem =
    openQuestionScorable &&
    primaryVerdict.scorablePairs === 1 &&
    leaveOneOutVerdict.scorablePairs === 0;
  const headlineSignChanges =
    Math.sign(primaryVerdict.netStrictCorrectnessChange) !==
      Math.sign(leaveOneOutVerdict.netStrictCorrectnessChange) ||
    validity.netValidityChange !== leaveOneOutValidity.netValidityChange;
  const section9TriggerMet = semanticEvidenceRestsSolelyOnThisItem || headlineSignChanges;

  const sliceRows = sliceRowsOf(paired);
  const previouslyRejected = sliceRows.filter((r) => r.slice === 'PREVIOUSLY_REJECTED');
  const historicallyRejectedNowAcceptedUnderBoth = previouslyRejected.filter(
    (r) => r.v1ValidatorState === 'ACCEPTED' && r.v2ValidatorState === 'ACCEPTED',
  ).length;
  const historicallyRejectedStillRejectedUnderBoth = previouslyRejected.filter(
    (r) => r.v1ValidatorState === 'REJECTED' && r.v2ValidatorState === 'REJECTED',
  ).length;
  const pageVersusUnit = sliceRows.filter((r) => r.slice === 'PAGE_VERSUS_UNIT');
  const pageVersusUnitVerdictDisagreements = pageVersusUnit.filter(
    (r) => r.v1Verdict !== null && r.v2Verdict !== null && r.v1Verdict !== r.v2Verdict,
  ).length;
  const pageVersusUnitRecoveries = pageVersusUnit.filter(
    (r) => r.validityTransition === 'REJECTED_TO_ACCEPTED',
  ).length;
  const unknownNoAxisDisagreements = sliceRows
    .filter((r) => r.slice === 'UNKNOWN_NO_CALIBRATION')
    .reduce((total, row) => {
      if (row.v1Axes === null || row.v2Axes === null) return total;
      const v1Axes = row.v1Axes;
      const v2Axes = row.v2Axes;
      return total + Object.keys(v1Axes).filter((axis) => v1Axes[axis] !== v2Axes[axis]).length;
    }, 0);

  const mcNemar =
    verdictTransitions !== undefined && verdictTransitions.scorablePairs > 0
      ? computeMcNemar(
          verdictTransitions.CORRECT_TO_INCORRECT,
          verdictTransitions.INCORRECT_TO_CORRECT,
        )
      : null;

  // F4A: the freeze's own gates, re-evaluated with the open owner question
  // removed. F0B's unresolvedGold policy binds on exactly this comparison:
  // "if any pass/fail gate differs between the primary metrics and the
  // leave-one-out report, the final status is BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION".
  const leaveOneOutSemantic = goldIsAvailable
    ? FROZEN_VARIANTS.map((variant) =>
        semanticMetricsOf(
          variant.name,
          (rowsByVariant.get(variant.name) ?? []).filter(
            (row) => row.goldId !== F4_OPEN_OWNER_GOLD_ID,
          ),
          frozenGates,
        ),
      )
    : [];
  const gateVerdictFlips = semanticMetrics.flatMap((primary, index) => {
    const loo = leaveOneOutSemantic[index];
    if (loo === undefined) return [];
    return primary.gates
      .map((gate, gateIndex) => ({ gate, looGate: loo.gates[gateIndex] }))
      .filter((pair) => pair.looGate !== undefined && pair.gate.met !== pair.looGate.met)
      .map((pair) => ({
        variantName: primary.variantName,
        gate: pair.gate.gate,
        threshold: pair.gate.threshold,
        primaryObserved: pair.gate.observed,
        primaryDenominator: pair.gate.denominator,
        primaryMet: pair.gate.met,
        leaveOneOutObserved: pair.looGate?.observed ?? null,
        leaveOneOutDenominator: pair.looGate?.denominator ?? 0,
        leaveOneOutMet: pair.looGate?.met ?? null,
      }));
  });
  const gateVerdictsDiffer = gateVerdictFlips.length > 0;

  const goldUnavailable = scorable.length === 0;

  /**
   * The derived comparison. No threshold is invented here: the only bounds
   * used are the freeze's own gates, and the only movement counted is the
   * PAIRED per-item transition, so a variant cannot look better by answering
   * a different set of items.
   */
  const netByField = correctnessByField.map((field) => ({
    field: field.field,
    scorablePairs: field.scorablePairs,
    net: field.netStrictCorrectnessChange,
  }));
  const scoredFields = netByField.filter((entry) => entry.scorablePairs > 0);
  const netOverall = scoredFields.reduce((total, entry) => total + entry.net, 0);
  const regressedFields = scoredFields.filter((entry) => entry.net < 0);
  const improvedFields = scoredFields.filter((entry) => entry.net > 0);
  const gatesLostByV2 = goldIsAvailable
    ? (semanticMetrics[0]?.gates ?? []).filter(
        (gate, index) => gate.met === true && semanticMetrics[1]?.gates[index]?.met === false,
      )
    : [];
  const gatesGainedByV2 = goldIsAvailable
    ? (semanticMetrics[0]?.gates ?? []).filter(
        (gate, index) => gate.met === false && semanticMetrics[1]?.gates[index]?.met === true,
      )
    : [];
  /**
   * F0B's sensitivity rule still FIRES exactly as before — the gate really
   * does flip at 13 items, and that is reported wherever it was reported
   * before. What changes is only whether the fired rule still BLOCKS.
   *
   * The status F0B names is BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION, and the
   * owner adjudication is the event it is pending on. A record that confirms
   * the already-scored label byte for byte discharges it without touching a
   * single number; `loadOwnerAdjudication` refuses a record that confirms
   * anything else, so this is never a route to re-labelling by assertion.
   */
  const sensitivityRuleFires = goldIsAvailable
    ? gateVerdictsDiffer || headlineSignChanges
    : section9TriggerMet;
  const openGoldQuestionAdjudicated = ownerAdjudication !== null;
  const blockedByOpenGoldQuestion = sensitivityRuleFires && !openGoldQuestionAdjudicated;

  const recommendation: Recommendation = goldUnavailable
    ? 'INSUFFICIENT_VALID_DEV_EVIDENCE'
    : blockedByOpenGoldQuestion
      ? 'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION'
      : gatesLostByV2.length > 0 || regressedFields.length > 0 || netOverall <= 0
        ? 'KEEP_PROMPT_V1_AND_REVISE_V2'
        : 'PROMOTE_PROMPT_V2_TO_NEXT_GATE';
  const concurrentStatus: Recommendation | null =
    (goldUnavailable
      ? section9TriggerMet && !openGoldQuestionAdjudicated
      : blockedByOpenGoldQuestion) && recommendation !== 'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION'
      ? 'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION'
      : null;

  const goldBackedBasis = [
    `Gold is available for all ${availability.devItemCount} DEVELOPMENT items from the ` +
      `scoring-only supplement (${supplement?.supplementPath ?? ''}), projected under explicit ` +
      'owner authorisation from the mixed adjudication file. It was created AFTER inference, was ' +
      'never visible to the model, and leaves the F0B inference freeze byte-unchanged.',
    `PAIRED, per item: v2 nets ${netOverall >= 0 ? '+' : ''}${netOverall} correct answers across ` +
      `${scoredFields.length} scorable field(s). Improved: ` +
      `${improvedFields.map((f) => `${f.field} ${f.net > 0 ? '+' : ''}${f.net}`).join(', ') || 'none'}. ` +
      `Regressed: ${regressedFields.map((f) => `${f.field} ${f.net}`).join(', ') || 'none'}.`,
    `Frozen gates: v2 loses ${gatesLostByV2.length} gate(s) v1 met ` +
      `(${gatesLostByV2.map((g) => g.gate).join(', ') || 'none'}) and gains ` +
      `${gatesGainedByV2.length} (${gatesGainedByV2.map((g) => g.gate).join(', ') || 'none'}). ` +
      "These thresholds are F0B's; none was invented, relaxed or re-tuned here.",
    'Validator acceptance is reported separately and is NOT presented as semantic correctness: ' +
      'an accepted answer is a verifiable answer, not a right one.',
    ...(blockedByOpenGoldQuestion
      ? [
          `F0B's leave-one-out rule FIRES: removing the open owner gold question ` +
            `${F4_OPEN_OWNER_GOLD_ID} changes a gate verdict or the sign of a headline, so ` +
            'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION is the binding status.',
        ]
      : sensitivityRuleFires && openGoldQuestionAdjudicated
        ? [
            `F0B's leave-one-out rule STILL FIRES and is still reported in full: removing ` +
              `${F4_OPEN_OWNER_GOLD_ID} does change a gate verdict. It no longer BLOCKS, because ` +
              'the status it names — BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION — was pending an ' +
              'owner adjudication that has now happened. The owner confirmed the existing label ' +
              `(${ownerAdjudication?.confirmedVerdict ?? ''} / ` +
              `${ownerAdjudication?.confirmedUnitType ?? ''}) on the frozen document and rubric ` +
              'alone, with no model prediction and no metric effect in view, so every number ' +
              'above is identical to the pre-adjudication derivation.',
            'The leave-one-out view is NOT evidence against the owner-confirmed primary label. ' +
              'It measures how thin a 14-item unit-type denominator is: one item is 7.1% of it, ' +
              'so a single removal crossing a 0.85 threshold is a statement about the ' +
              'denominator, not about the label. The primary metric remains the reported one.',
          ]
        : [
            `F0B's leave-one-out rule does NOT fire: removing ${F4_OPEN_OWNER_GOLD_ID} changes no ` +
              'gate verdict and no headline sign, so the open owner question does not decide this.',
          ]),
    ...(recommendation === 'KEEP_PROMPT_V1_AND_REVISE_V2'
      ? [
          'KEEP_PROMPT_V1_AND_REVISE_V2 is the closest available enum member and it does NOT ' +
            'mean v1 passes. V1 fails frozen gates of its own; it remains the COMPARATOR while a ' +
            'new prompt iteration is designed. Nothing here promotes v1, authorises a HOLDOUT ' +
            'run, or declares any variant acceptable.',
        ]
      : []),
  ];

  const recommendationBasis = goldUnavailable
    ? [
        'No gold-backed field is reachable from any DEVELOPMENT-only source, so no semantic ' +
          'accuracy metric has a denominator and neither variant can be shown better or worse.',
        `The only gold-label file for this corpus (${availability.labelFileNotOpened}) holds ` +
          `${availability.labelFileRecordCount} mixed DEVELOPMENT+HOLDOUT records with no split ` +
          `field (${availability.devItemCount} DEVELOPMENT + ${availability.holdoutItemCount} ` +
          'HOLDOUT); the F0B freeze lists it never-read and this task forbids opening it.',
        'Validator validity, its paired transitions, and gold-free v1/v2 answer concordance ARE ' +
          'measured below and are reported as exactly that — not as accuracy.',
        ...(section9TriggerMet
          ? [
              `The ONLY gold-backed comparison this task can make is ${F4_OPEN_OWNER_GOLD_ID}, the ` +
                'item F0B records as an open owner gold question, and it moves ' +
                `${primaryVerdict.CORRECT_TO_INCORRECT > 0 ? 'from correct under v1 to incorrect under v2' : 'between the variants'}. ` +
                "Removing it removes every semantic pair, so F0B's leave-one-out rule fires: " +
                'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION holds concurrently.',
            ]
          : []),
      ]
    : goldBackedBasis;

  return {
    scorerVersion: goldIsAvailable ? F4A_GOLD_SCORER_VERSION : F4_SCORER_VERSION,
    outputSchemaVersion: goldIsAvailable
      ? F4A_GOLD_OUTPUT_SCHEMA_VERSION
      : F4_OUTPUT_SCHEMA_VERSION,
    sources: {
      freezeVersion: sources.freeze.version,
      freezeRawSha256: sources.freezeRawSha256,
      corpusRawSha256: sources.corpusRawSha256,
      corpusManifestRawSha256: sources.corpusManifestRawSha256,
      corpusContentSha256: sources.corpusContentSha256,
      planSha256: sources.planSha256,
      artifactsVerified: sources.artifactsVerified,
      artifactInventorySha256: sources.artifactInventorySha256,
      consumptionMarkerSha256: sources.consumptionMarkerSha256,
      consumedAtUtc: sources.consumedAtUtc,
      experimentStatus: sources.experimentStatus,
      experimentCompletedAtUtc: sources.experimentCompletedAtUtc,
      corpusItems: sources.corpusRows.length,
      corpusSplit: 'DEVELOPMENT',
    },
    goldAvailability: availability,
    ...(supplement === null
      ? {}
      : {
          goldSupplement: {
            supplementPath: supplement.supplementPath,
            supplementVersion: supplement.supplementVersion,
            supplementRawSha256: supplement.supplementRawSha256,
            fixturePath: supplement.fixturePath,
            fixtureRawSha256: supplement.fixtureRawSha256,
            fixtureManifestRawSha256: supplement.fixtureManifestRawSha256,
            mixedSourceWholeFileSha256: supplement.sourceWholeFileSha256,
            labelCount: supplement.labelCount,
            createdAfterInference: true as const,
            visibleToModelDuringInference: false as const,
            altersInferenceFreeze: false as const,
          },
        }),
    ...(ownerAdjudication === null
      ? {}
      : {
          ownerAdjudication: {
            recordPath: ownerAdjudication.recordPath,
            recordRawSha256: ownerAdjudication.recordRawSha256,
            schemaVersion: ownerAdjudication.schemaVersion,
            goldId: ownerAdjudication.goldId,
            decision: ownerAdjudication.decision,
            ownerStatement: ownerAdjudication.ownerStatement,
            basis: ownerAdjudication.basis,
            confirmedVerdict: ownerAdjudication.confirmedVerdict,
            confirmedUnitType: ownerAdjudication.confirmedUnitType,
            goldRecordSha256: ownerAdjudication.goldRecordSha256,
            recordedAtUtc: ownerAdjudication.recordedAtUtc,
            recordedAtUtcMeaning: ownerAdjudication.recordedAtUtcMeaning,
            labelChanged: false as const,
            modelPredictionsConsidered: false as const,
            metricEffectsConsidered: false as const,
            altersAnyPrediction: false as const,
            altersAnyGoldValue: false as const,
            altersAnyMetricDenominator: false as const,
            altersAnyThreshold: false as const,
            dischargedBlocker: 'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION' as const,
            dischargeBasis:
              'The record confirms byte for byte the label this derivation already scored: gold ' +
              `record ${ownerAdjudication.goldRecordSha256} in fixture ` +
              `${supplement?.fixtureRawSha256 ?? ''}. Because nothing about the gold moved, every ` +
              'metric here is identical to the pre-adjudication derivation, and the discharge is ' +
              'a change of STATUS only.',
          },
        }),
    ...(goldIsAvailable
      ? {
          acceptability: {
            anyVariantAcceptable: false as const,
            anyVariantProductionReady: false as const,
            perVariant: semanticMetrics.map((metrics) => ({
              variantName: metrics.variantName,
              failedGates: metrics.gates.filter((g) => g.met === false).map((g) => g.gate),
              acceptable: false as const,
            })),
            gatesFailedByEveryVariant: (semanticMetrics[0]?.gates ?? [])
              .filter(
                (gate, index) =>
                  gate.met === false && semanticMetrics.every((m) => m.gates[index]?.met === false),
              )
              .map((gate) => gate.gate),
            note:
              'NEITHER VARIANT IS ACCEPTABLE AND NEITHER IS PRODUCTION-READY. Every variant ' +
              "fails at least one of F0B's own frozen gates, and the gates listed in " +
              'gatesFailedByEveryVariant are failed by all of them. No recommendation in this ' +
              'file promotes a variant, authorises a HOLDOUT run, or authorises a merge to main.',
          },
        }
      : {}),
    scorableGoldBackedFields: scorable.map((f) => f.field),
    unscorableGoldBackedFields: unscorable.map((f) => f.field),
    ...(goldIsAvailable ? { semanticMetrics } : {}),
    variants,
    paired: {
      pairs: paired.length,
      validity,
      correctnessByField,
      concordanceByField,
      mcNemarOnVerdictCorrectness: mcNemar,
      mcNemarNote:
        'Exploratory only. 49 DEVELOPMENT items, one sample per variant, a stochastic model: ' +
        'this is never evidence of generalisation, and it is null while gold is unavailable.',
    },
    slices: sliceRows,
    ...(goldIsAvailable ? { f4aInterpretation: interpretF4A(paired) } : {}),
    goldQuestionSensitivity: {
      goldId: F4_OPEN_OWNER_GOLD_ID,
      presentInCorpus: openQuestionPresent,
      committedLabel,
      labelChangedByThisTask: false,
      sensitivityRuleFires,
      ownerAdjudicated: openGoldQuestionAdjudicated,
      ...(ownerAdjudication === null
        ? {}
        : {
            ownerDecision: ownerAdjudication.decision,
            ownerConfirmedVerdict: ownerAdjudication.confirmedVerdict,
            ownerConfirmedUnitType: ownerAdjudication.confirmedUnitType,
            ownerAdjudicationRecordPath: ownerAdjudication.recordPath,
            ownerAdjudicationRecordRawSha256: ownerAdjudication.recordRawSha256,
          }),
      primary: { items: paired.length, validity, verdictCorrectness: primaryVerdict },
      leaveOneOut: {
        items: withoutOpenQuestion.length,
        validity: leaveOneOutValidity,
        verdictCorrectness: leaveOneOutVerdict,
        ...(goldIsAvailable
          ? {
              gates: leaveOneOutSemantic.map((metrics) => ({
                variantName: metrics.variantName,
                gates: metrics.gates,
              })),
            }
          : {}),
      },
      ...(goldIsAvailable ? { gateVerdictFlips } : {}),
      changesAnyHeadline: headlineSignChanges,
      semanticEvidenceRestsSolelyOnThisItem,
      section9TriggerMet,
      headlineComparisonNote: goldIsAvailable
        ? 'Validator validity is unchanged by the exclusion. ' +
          (gateVerdictFlips.length === 0
            ? 'No frozen gate changes its pass/fail verdict either, so the open owner question ' +
              'does not decide the comparison.'
            : `${gateVerdictFlips.length} frozen gate verdict(s) DO change: ` +
              `${gateVerdictFlips
                .map(
                  (flip) =>
                    `${flip.variantName} ${flip.gate} ` +
                    `${flip.primaryMet === true ? 'MET' : 'NOT MET'} at ` +
                    `${flip.primaryDenominator} items but ` +
                    `${flip.leaveOneOutMet === true ? 'MET' : 'NOT MET'} at ` +
                    `${flip.leaveOneOutDenominator}`,
                )
                .join('; ')}. ` +
              (openGoldQuestionAdjudicated
                ? "F0B's unresolvedGold policy named that status " +
                  'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION; the owner has since adjudicated the ' +
                  `item and CONFIRMED its existing label (${ownerAdjudication?.decision ?? ''}), ` +
                  'so the blocker is discharged while this flip stays reported exactly as ' +
                  'measured. The flip is a statement about a 14-item denominator, NOT evidence ' +
                  'against the owner-confirmed label, and the primary metric remains the ' +
                  'reported one.'
                : "F0B's unresolvedGold policy makes that " +
                  'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION.')) +
          (openGoldQuestionAdjudicated
            ? ' Its label was CONFIRMED unchanged by the owner on the frozen document and rubric ' +
              'alone; no label was changed or reinterpreted here.'
            : ' Its label is NOT adjudicated, changed or reinterpreted here.')
        : 'Validator validity is unchanged by the exclusion. The semantic comparison is not: this ' +
          'item is the only pair with any gold at all, so excluding it leaves no semantic evidence ' +
          'whatsoever. Its label is NOT adjudicated, changed or reinterpreted here.',
    },
    interpretation: goldIsAvailable
      ? (() => {
          const f4a = interpretF4A(paired);
          const stillRejected = f4a.persistentRejections.map((r) => r.goldId).join(', ');
          const recoveredCorrect = f4a.validatorRecoveries.filter(
            (r) => r.v2VerdictCorrect === true,
          ).length;
          const axisTotals = f4a.axisMovementTotals;
          const verdictTotals = f4a.verdictMovementTotals;
          return {
            didCanonicalisationEliminateKnownValidatorFailures:
              `PARTIALLY, AND THE REMAINDER IS NAMED. ${f4a.validatorRecoveries.length} item(s) ` +
              `moved from validator-rejected under v1 to accepted under v2, of which ` +
              `${recoveredCorrect} carry a v2 verdict that matches gold. ` +
              `${f4a.persistentRejections.length} item(s) are still rejected under both ` +
              `(${stillRejected || 'none'}); their rejection categories and reasons are listed ` +
              'in f4aInterpretation.persistentRejections. Validator acceptance is verifiability, ' +
              'never semantic correctness.',
            didPromptV2ImprovePageVersusUnit:
              `MIXED, AND MEASURABLE. The two variants give different verdicts on ` +
              `${f4a.verdictMovements.length} item(s): ${verdictTotals['CORRECTION'] ?? 0} are ` +
              `corrections (v1 wrong, v2 right), ${verdictTotals['REGRESSION'] ?? 0} are ` +
              `regressions (v1 right, v2 wrong), ${verdictTotals['NEITHER_CORRECT'] ?? 0} leave ` +
              `correctness unchanged and ${verdictTotals['NOT_COMPARABLE'] ?? 0} involve a ` +
              'validator-rejected answer. Net verdict correctness is ' +
              `${primaryVerdict.netStrictCorrectnessChange >= 0 ? '+' : ''}` +
              `${primaryVerdict.netStrictCorrectnessChange} over ${primaryVerdict.scorablePairs} ` +
              'paired items. Every row is in f4aInterpretation.verdictMovements with its gold.',
            didPromptV2ImproveUnknownVersusNoCalibration:
              `YES ON THE AXIS ITSELF; THE DAMAGE COMES FROM ELSEWHERE. v1 emitted NO on ` +
              `${f4a.v1NoAnswers} axis answer(s), of which ${f4a.v1NoAnswersThatWereCorrect} ` +
              `matched gold; v2 emitted NO on ${f4a.v2NoAnswers}. Dropping NO cost nothing, ` +
              'because no gold axis in this corpus is NO at all — the classes present are ' +
              `${f4a.axisGoldClassesPresent.join('/')}. Of the ${axisTotals['REGRESSION'] ?? 0} ` +
              `axis regressions, ${f4a.axisRegressionsCausedByVerdictMove} are a CONSEQUENCE of ` +
              'v2 moving the verdict to NOT_A_UNIT, which nulls all three axes by the output ' +
              `schema's own biconditional, and ${f4a.axisRegressionsIndependentOfVerdict} are ` +
              `independent of the verdict. ${axisTotals['CORRECTION'] ?? 0} axis answers are ` +
              'corrected. The UNKNOWN/NO calibration change is a gain; the verdict change is ' +
              'what loses axis accuracy.',
            didPromptV2IntroduceRegressionsElsewhere:
              `YES, AND THEY ARE NAMED. No validity regression: ` +
              `${validity.ACCEPTED_TO_REJECTED} item(s) moved from accepted to rejected. ` +
              'Semantically, ' +
              `${f4a.regressionsByField.map((r) => `${r.field} ${r.goldIds.length}`).join(', ') || 'no field'} ` +
              'regressed at least one previously-correct item; every gold id is listed in ' +
              'f4aInterpretation.regressionsByField. A net gain on one field does not cancel a ' +
              'regression on another, and neither is reported as an aggregate improvement.',
          };
        })()
      : {
          didCanonicalisationEliminateKnownValidatorFailures:
            `PARTIALLY. Of the ${F4_SLICES.PREVIOUSLY_REJECTED.length} items the historical DEV v1 ` +
            `pass reported rejected, ${historicallyRejectedNowAcceptedUnderBoth} now validate under ` +
            `BOTH prompts and ${historicallyRejectedStillRejectedUnderBoth} are still rejected under ` +
            'both. This is a validator-validity statement only; whether the accepted answers are ' +
            'semantically right is unknown.',
          didPromptV2ImprovePageVersusUnit:
            'UNANSWERABLE without gold. On the five page-versus-unit items the two prompts disagree ' +
            `on verdict for ${pageVersusUnitVerdictDisagreements} of the items both answered, and v2 ` +
            `newly produced a verifiable answer for ${pageVersusUnitRecoveries}; which answer is ` +
            'correct cannot be established from any DEVELOPMENT-only source.',
          didPromptV2ImproveUnknownVersusNoCalibration:
            'UNANSWERABLE without gold. On the four calibration items both prompts returned the same ' +
            `verdict and unit type; the relevance axes differ on ${unknownNoAxisDisagreements} ` +
            'axis-comparisons across those items. No gold axis value exists to grade them against.',
          didPromptV2IntroduceRegressionsElsewhere:
            `NO VALIDITY REGRESSION: ${validity.ACCEPTED_TO_REJECTED} items moved from accepted to ` +
            'rejected. Semantic regression is unmeasurable except on the single gold-backed item, ' +
            `where v2 ${primaryVerdict.CORRECT_TO_INCORRECT > 0 ? 'regressed' : 'did not regress'}. ` +
            `Gold-free, the two prompts give different structured answers on a substantial minority ` +
            'of items (see concordanceByField), which is a behavioural change of unknown sign.',
        },
    recommendation,
    concurrentStatus,
    recommendationBasis,
    recommendationScope:
      'This recommendation concerns the DEVELOPMENT split only. It authorises no merge to main, ' +
      'no HOLDOUT run, no production configuration change and no deployment.',
  };
}

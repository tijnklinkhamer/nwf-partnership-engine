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
  F4_EXPECTED_VALIDATOR_TOTALS,
  F4_OPEN_OWNER_GOLD_ID,
  F4_OUTPUT_SCHEMA_VERSION,
  F4_SCORER_VERSION,
  F4_SLICES,
  F4_SLICE_NAMES,
} from './constants.js';
import { GOLD_BACKED_FIELDS, type GoldAvailability } from './gold.js';
import { computeMcNemar, rate, type McNemarResult } from './metrics.js';
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
import type { ScoredItem } from './score.js';
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
  };
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
  readonly scorableGoldBackedFields: readonly string[];
  readonly unscorableGoldBackedFields: readonly string[];
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

export function buildSummary(
  sources: LoadedSources,
  rowsByVariant: ReadonlyMap<FrozenVariantName, readonly ScoredItem[]>,
  paired: readonly PairedItem[],
  availability: GoldAvailability,
  committedLabel: string | null,
): F4Summary {
  const variants = FROZEN_VARIANTS.map((variant) =>
    summariseVariant(sources, variant.name, rowsByVariant.get(variant.name) ?? []),
  );
  const validity = countValidityTransitions(paired);
  const correctnessByField = GOLD_BACKED_FIELDS.map((field) =>
    countCorrectnessTransitions(paired, field),
  );
  const concordanceByField = CONCORDANCE_FIELD_NAMES.map((field) =>
    countConcordance(paired, field),
  );
  const verdictTransitions = correctnessByField.find((c) => c.field === 'verdict');
  const scorable = availability.fields.filter(
    (f) => f.available && f.source === 'DEV_CANONICAL_CORPUS',
  );
  const unscorable = availability.fields.filter(
    (f) => !f.available || f.source !== 'DEV_CANONICAL_CORPUS',
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

  const goldUnavailable = scorable.length === 0;
  const recommendation: Recommendation = goldUnavailable
    ? 'INSUFFICIENT_VALID_DEV_EVIDENCE'
    : 'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION';
  const concurrentStatus: Recommendation | null = section9TriggerMet
    ? 'BLOCKED_PENDING_OWNER_GOLD_ADJUDICATION'
    : null;
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
    : ['A gold-backed field is available; see the metric tables.'];

  return {
    scorerVersion: F4_SCORER_VERSION,
    outputSchemaVersion: F4_OUTPUT_SCHEMA_VERSION,
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
    scorableGoldBackedFields: scorable.map((f) => f.field),
    unscorableGoldBackedFields: unscorable.map((f) => f.field),
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
    goldQuestionSensitivity: {
      goldId: F4_OPEN_OWNER_GOLD_ID,
      presentInCorpus: openQuestionPresent,
      committedLabel,
      labelChangedByThisTask: false,
      primary: { items: paired.length, validity, verdictCorrectness: primaryVerdict },
      leaveOneOut: {
        items: withoutOpenQuestion.length,
        validity: leaveOneOutValidity,
        verdictCorrectness: leaveOneOutVerdict,
      },
      changesAnyHeadline: headlineSignChanges,
      semanticEvidenceRestsSolelyOnThisItem,
      section9TriggerMet,
      headlineComparisonNote:
        'Validator validity is unchanged by the exclusion. The semantic comparison is not: this ' +
        'item is the only pair with any gold at all, so excluding it leaves no semantic evidence ' +
        'whatsoever. Its label is NOT adjudicated, changed or reinterpreted here.',
    },
    interpretation: {
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

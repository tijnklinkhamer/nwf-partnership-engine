/**
 * PHASE 2B-2D2C-F4 — ONE SCORED ROW PER (ITEM, VARIANT).
 *
 * A scored row records what the validator decided about one document under
 * one prompt variant, the STRUCTURED prediction fields that document's
 * result carries, and — where a DEVELOPMENT-only gold source actually
 * supplies one — the gold value and the field-level correctness.
 *
 * Two denominators, never mixed:
 *
 *   - STRICT: every one of the corpus's items is in the denominator, and a
 *     validator-rejected or missing item counts INCORRECT. A prompt must not
 *     improve apparent accuracy by emitting unverifiable output.
 *   - CONDITIONAL: only validator-accepted items are in the denominator, and
 *     the denominator is reported next to every conditional number.
 *
 * A row carries no raw provider output: no rationale, no evidence quote, no
 * transcript. `unit_name` is reduced to presence plus a SHA-256, which is
 * enough to compare two variants' answers without reproducing the text.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import type { ClassificationResult } from '../../../../orgunits/classify/outputSchema.js';
import type {
  GoldCorpusItem,
  ProposedLabel,
} from '../../../../orgunits/classify/evaluation/goldSchema.js';
import { sha256Hex } from '../freeze.js';
import { GOLD_BACKED_FIELDS, requireAvailable, type GoldAvailability } from './gold.js';
import type { LoadedEvaluation, LoadedSources, ScoredVariantName } from './sources.js';

/** F0D: the sources a per-variant scoring pass reads — satisfied by the attempt-1 and the attempt-2 loaders alike. */
export type ScoringSourceRows = Pick<LoadedSources, 'corpusRows' | 'evaluations'>;

export class ScoringError extends Error {
  override readonly name = 'ScoringError';
}

function fail(message: string): never {
  throw new ScoringError(message);
}

export type ValidatorState = 'ACCEPTED' | 'REJECTED';

/** Only the STRUCTURED, enumerable fields of a result — never its prose. */
export interface PredictionFields {
  readonly verdict: 'UNIT_PAGE' | 'NOT_A_UNIT' | 'NEEDS_REVIEW';
  readonly unit_type: string | null;
  readonly page_kind: string | null;
  readonly serves_incoming_international_students: string | null;
  readonly serves_outgoing_mobility_students: string | null;
  readonly provides_language_learning_or_support: string | null;
  readonly confidence: string;
  readonly unit_name_present: boolean;
  /** SHA-256 of the unit name, or null. Comparable across variants; not the text. */
  readonly unit_name_sha256: string | null;
  readonly evidence_span_sources: readonly string[];
  readonly evidence_span_count: number;
}

/**
 * `NOT_APPLICABLE` (F4A) is NOT a missing measurement. It marks a field the
 * gold label defines as undefined for THIS item — `unit_type` on an item
 * whose gold verdict is NOT_A_UNIT, `page_kind` on a UNIT_PAGE, a relevance
 * axis on a non-unit, an `ANY` unit-name expectation — plus `hard_negative`,
 * which is a denominator FLAG rather than anything a model predicts. Keeping
 * it distinct from `GOLD_UNAVAILABLE` is what stops the biconditional's own
 * null half from being counted as a failure to measure.
 */
export type FieldCorrectness =
  'CORRECT' | 'INCORRECT' | 'GOLD_UNAVAILABLE' | 'NO_PREDICTION' | 'NOT_APPLICABLE';

export interface ScoredItem {
  readonly goldId: string;
  readonly corpusLineNumber: number;
  readonly docIndex: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly logicalBatchOrdinal: number;
  readonly positionWithinBatch: number;
  readonly sequence: number;
  readonly variantName: ScoredVariantName;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly variantGitCommit: string;
  readonly finalInputSha256: string;
  readonly rawOutputSha256: string | null;
  readonly validationResultSha256: string;
  readonly finalRecordSha256: string;
  /** POST-REPAIR when a repair exists for this item (ADR 0011); otherwise the first-pass state. */
  readonly validatorState: ValidatorState;
  readonly rejectionCategory: string | null;
  readonly rejectionReason: string | null;
  readonly prediction: PredictionFields | null;
  /**
   * ADR 0011: PRESENT ONLY when a repair was recorded for this item — never
   * on an attempt-1 row, which keeps those rows byte-identical. The
   * FIRST-PASS validator state the original call recorded, before repair.
   */
  readonly firstPass?: {
    readonly validatorState: 'REJECTED';
    readonly rejectionCategory: string;
    readonly rejectionReason: string;
  };
  /** ADR 0011: the repair's disposition and artifact identities. Present exactly when `firstPass` is. */
  readonly repair?: {
    readonly disposition: 'ACCEPTED' | 'REJECTED' | 'PROVIDER_FAILED' | 'SKIPPED';
    readonly errorKind: string | null;
    readonly reasonCodes: readonly string[];
    readonly rawOutputSha256: string | null;
    readonly repairOutcomeSha256: string;
  };
  readonly gold: Readonly<Record<string, string | null>>;
  readonly goldSource: Readonly<Record<string, string>>;
  readonly fieldCorrectness: Readonly<Record<string, FieldCorrectness>>;
  readonly strictScorableFields: readonly string[];
  readonly conditionalScorableFields: readonly string[];
}

function predictionOf(result: ClassificationResult): PredictionFields {
  return {
    verdict: result.verdict,
    unit_type: result.unit_type,
    page_kind: result.page_kind,
    serves_incoming_international_students: result.serves_incoming_international_students,
    serves_outgoing_mobility_students: result.serves_outgoing_mobility_students,
    provides_language_learning_or_support: result.provides_language_learning_or_support,
    confidence: result.confidence,
    unit_name_present: result.unit_name !== null,
    unit_name_sha256: result.unit_name === null ? null : sha256Hex(result.unit_name),
    evidence_span_sources: result.evidence_spans.map((span) => span.source),
    evidence_span_count: result.evidence_spans.length,
  };
}

/**
 * The gold a DEVELOPMENT-only source supplies.
 *
 * `verdictByGoldId` is the F0B freeze's single preserved verdict — one item,
 * one field. `labelByGoldId` is the F4A scoring supplement's full
 * DEVELOPMENT label set. When both are present the FULL set wins: a
 * one-item source must never shadow a corpus-wide one.
 */
export interface PreservedGold {
  readonly verdictByGoldId: ReadonlyMap<string, string>;
  readonly labelByGoldId?: ReadonlyMap<string, ProposedLabel>;
}

/**
 * The gold class for one field of one item, or `null` when the gold label
 * defines that field as undefined for this item.
 *
 * `unit_name_expectation` is reduced to its `kind`: the hard gate is the
 * MECHANICAL rule (a NULL expectation requires a null unit_name, a NAMED one
 * requires a non-null unit_name), and name AGREEMENT stays a soft, reported
 * metric exactly as `ProposedLabelSchema` documents. `hard_negative` is
 * returned as a flag string but never compared against a prediction.
 */
export function goldClassOf(label: ProposedLabel, field: string): string | null {
  switch (field) {
    case 'verdict':
      return label.verdict;
    case 'unit_type':
      return label.unit_type;
    case 'page_kind':
      return label.page_kind;
    case 'serves_incoming_international_students':
      return label.serves_incoming_international_students;
    case 'serves_outgoing_mobility_students':
      return label.serves_outgoing_mobility_students;
    case 'provides_language_learning_or_support':
      return label.provides_language_learning_or_support;
    case 'unit_name_expectation':
      return label.unit_name_expectation.kind === 'ANY' ? null : label.unit_name_expectation.kind;
    case 'hard_negative':
      return label.hard_negative ? 'HARD_NEGATIVE' : 'NOT_HARD_NEGATIVE';
    default:
      return null;
  }
}

/** The predicted class for one field, in the SAME vocabulary as the gold. */
export function predictedClassOf(prediction: PredictionFields, field: string): string {
  switch (field) {
    case 'verdict':
      return prediction.verdict;
    case 'unit_type':
      return prediction.unit_type ?? 'NULL';
    case 'page_kind':
      return prediction.page_kind ?? 'NULL';
    case 'serves_incoming_international_students':
      return prediction.serves_incoming_international_students ?? 'NULL';
    case 'serves_outgoing_mobility_students':
      return prediction.serves_outgoing_mobility_students ?? 'NULL';
    case 'provides_language_learning_or_support':
      return prediction.provides_language_learning_or_support ?? 'NULL';
    case 'unit_name_expectation':
      return prediction.unit_name_present ? 'NAMED' : 'NULL';
    default:
      return 'NULL';
  }
}

/** `hard_negative` is a denominator flag, never something a model answers. */
export const NON_PREDICTED_GOLD_FIELDS: readonly string[] = Object.freeze(['hard_negative']);

/**
 * Builds every scored row for one variant's twelve evaluations.
 *
 * Fails closed on a duplicate gold id, a missing or extra document, a
 * document claimed both accepted and rejected, and any non-DEVELOPMENT row.
 */
export type CorpusIndex = ReadonlyMap<
  string,
  { readonly row: GoldCorpusItem; readonly line: number }
>;

/** F0X: the DEVELOPMENT corpus by gold id. Fails closed on a non-DEVELOPMENT or duplicated row. */
export function corpusIndexOf(corpusRows: readonly GoldCorpusItem[]): CorpusIndex {
  const corpusByGoldId = new Map<string, { row: GoldCorpusItem; line: number }>();
  corpusRows.forEach((row, index) => {
    if (row.split !== 'DEVELOPMENT')
      fail(`corpus row ${row.goldId} is ${row.split}; only DEVELOPMENT is scorable.`);
    if (corpusByGoldId.has(row.goldId))
      fail(`duplicate gold id ${row.goldId} in the canonical corpus.`);
    corpusByGoldId.set(row.goldId, { row, line: index + 1 });
  });
  return corpusByGoldId;
}

/**
 * F0X: every scored row of ONE validated evaluation, in batch order. Fails
 * closed on a gold id outside the corpus and a docIndex that disagrees with
 * the corpus row.
 */
export function scoreEvaluation(
  evaluation: LoadedEvaluation,
  corpusByGoldId: CorpusIndex,
  availability: GoldAvailability,
  preserved: PreservedGold,
): readonly ScoredItem[] {
  const rows: ScoredItem[] = [];
  for (const [position, goldId] of evaluation.orderedGoldIds.entries()) {
    const docIndex = evaluation.orderedDocIndices[position];
    if (docIndex === undefined)
      fail(`${evaluation.attemptDirectory}: no docIndex at position ${position}.`);
    const corpusEntry = corpusByGoldId.get(goldId);
    if (corpusEntry === undefined)
      fail(`gold id ${goldId} is not a DEVELOPMENT canonical corpus row.`);
    if (corpusEntry.row.docIndex !== docIndex) {
      fail(
        `gold id ${goldId}: docIndex ${docIndex} differs from the corpus row's ${corpusEntry.row.docIndex}.`,
      );
    }
    rows.push(
      scoreOne(evaluation, goldId, docIndex, corpusEntry.line, position, availability, preserved),
    );
  }
  return rows;
}

/**
 * Builds every scored row for one variant's twelve evaluations.
 *
 * Fails closed on a duplicate gold id, a missing or extra document, a
 * document claimed both accepted and rejected, and any non-DEVELOPMENT row.
 */
export function scoreVariant(
  sources: ScoringSourceRows,
  variantName: ScoredVariantName,
  availability: GoldAvailability,
  preserved: PreservedGold,
): readonly ScoredItem[] {
  const corpusByGoldId = corpusIndexOf(sources.corpusRows);

  const rows: ScoredItem[] = [];
  const seen = new Set<string>();
  const evaluations = sources.evaluations.filter((e) => e.variantName === variantName);
  if (evaluations.length === 0) fail(`no evaluation found for variant ${variantName}.`);

  for (const evaluation of evaluations) {
    for (const goldId of evaluation.orderedGoldIds) {
      if (seen.has(goldId)) fail(`gold id ${goldId} appears twice under ${variantName}.`);
      seen.add(goldId);
    }
    rows.push(...scoreEvaluation(evaluation, corpusByGoldId, availability, preserved));
  }
  if (seen.size !== sources.corpusRows.length) {
    fail(
      `variant ${variantName} covers ${seen.size} items; the corpus holds ${sources.corpusRows.length}.`,
    );
  }
  for (const goldId of corpusByGoldId.keys()) {
    if (!seen.has(goldId)) fail(`gold id ${goldId} is missing from variant ${variantName}.`);
  }
  return rows;
}

function scoreOne(
  evaluation: LoadedEvaluation,
  goldId: string,
  docIndex: number,
  corpusLineNumber: number,
  positionWithinBatch: number,
  availability: GoldAvailability,
  preserved: PreservedGold,
): ScoredItem {
  if (evaluation.validation.kind !== 'VALIDATED') {
    fail(`${evaluation.attemptDirectory}: validation is ${evaluation.validation.kind}.`);
  }
  const accepted = evaluation.validation.accepted.filter((a) => a.docIndex === docIndex);
  const rejected = evaluation.validation.rejected.filter((r) => r.docIndex === docIndex);
  if (accepted.length + rejected.length === 0) {
    fail(
      `${evaluation.attemptDirectory}: docIndex ${docIndex} (${goldId}) has no validator record.`,
    );
  }
  if (accepted.length + rejected.length > 1) {
    fail(
      `${evaluation.attemptDirectory}: docIndex ${docIndex} (${goldId}) has conflicting validator records.`,
    );
  }
  const acceptedEntry = accepted[0];
  const rejectedEntry = rejected[0];
  const firstPassState: ValidatorState = acceptedEntry !== undefined ? 'ACCEPTED' : 'REJECTED';

  // ADR 0011: a repair, when one was recorded, decides the POST-REPAIR state.
  // The loader already re-validated an ACCEPTED repair against the frozen
  // document, so `acceptedResult` is trusted here exactly as a first-pass
  // accepted result is.
  const repair = evaluation.repairs.find((r) => r.docIndex === docIndex);
  if (repair !== undefined && (firstPassState !== 'REJECTED' || rejectedEntry === undefined)) {
    fail(
      `${evaluation.attemptDirectory}: docIndex ${docIndex} (${goldId}) has a repair but was accepted first pass.`,
    );
  }
  const repaired =
    repair !== undefined && repair.disposition === 'ACCEPTED' && repair.acceptedResult !== null;
  const validatorState: ValidatorState = repaired ? 'ACCEPTED' : firstPassState;
  const prediction = repaired
    ? predictionOf(repair.acceptedResult!)
    : acceptedEntry === undefined
      ? null
      : predictionOf(acceptedEntry.result);

  const fields = goldFieldsOf(goldId, prediction, availability, preserved);

  return {
    goldId,
    corpusLineNumber,
    docIndex,
    echeRowKey: evaluation.echeRowKey,
    organisationId: evaluation.organisationId,
    logicalBatchOrdinal: evaluation.logicalBatchOrdinal,
    positionWithinBatch,
    sequence: evaluation.sequence,
    variantName: evaluation.variantName,
    promptVersion: evaluation.promptVersion,
    promptSha256: evaluation.promptSha256,
    variantGitCommit: evaluation.variantGitCommit,
    finalInputSha256: evaluation.finalInputSha256,
    rawOutputSha256: evaluation.rawOutputSha256,
    validationResultSha256: evaluation.artifactFileSha256['VALIDATION_RESULT'] ?? '',
    finalRecordSha256: evaluation.artifactFileSha256['FINAL_RECORD'] ?? '',
    validatorState,
    rejectionCategory: repaired ? null : (rejectedEntry?.category ?? null),
    rejectionReason: repaired ? null : (rejectedEntry?.reason ?? null),
    prediction,
    ...(repair === undefined || rejectedEntry === undefined
      ? {}
      : {
          firstPass: {
            validatorState: 'REJECTED' as const,
            rejectionCategory: rejectedEntry.category,
            rejectionReason: rejectedEntry.reason,
          },
          repair: {
            disposition: repair.disposition,
            errorKind: repair.errorKind,
            reasonCodes: repair.reasonCodes,
            rawOutputSha256: repair.rawOutputSha256,
            repairOutcomeSha256: repair.artifactFileSha256['REPAIR_OUTCOME'] ?? '',
          },
        }),
    ...fields,
  };
}

/** The gold-backed part of one scored row: gold values, their source, and field-level correctness. */
export interface GoldFields {
  readonly gold: Readonly<Record<string, string | null>>;
  readonly goldSource: Readonly<Record<string, string>>;
  readonly fieldCorrectness: Readonly<Record<string, FieldCorrectness>>;
  readonly strictScorableFields: readonly string[];
  readonly conditionalScorableFields: readonly string[];
}

/**
 * F0X: the per-field gold loop, shared by a validated item and (through
 * `scoreInvalidItem`) an INVALID one. A `null` prediction is STRICT-incorrect
 * on every gold-applicable field, never absent.
 */
export function goldFieldsOf(
  goldId: string,
  prediction: PredictionFields | null,
  availability: GoldAvailability,
  preserved: PreservedGold,
): GoldFields {
  const gold: Record<string, string | null> = {};
  const goldSource: Record<string, string> = {};
  const fieldCorrectness: Record<string, FieldCorrectness> = {};
  const strictScorableFields: string[] = [];
  const conditionalScorableFields: string[] = [];

  const label = preserved.labelByGoldId?.get(goldId);

  for (const field of GOLD_BACKED_FIELDS) {
    const entry = availability.fields.find((f) => f.field === field);
    if (entry === undefined || !entry.available) {
      gold[field] = null;
      goldSource[field] = 'NONE';
      fieldCorrectness[field] = 'GOLD_UNAVAILABLE';
      continue;
    }
    if (
      entry.source === 'F0B_FREEZE_UNRESOLVED_GOLD' &&
      !entry.availableForGoldIds.includes(goldId)
    ) {
      gold[field] = null;
      goldSource[field] = 'NONE';
      fieldCorrectness[field] = 'GOLD_UNAVAILABLE';
      continue;
    }
    // Fails closed if a caller ever widens availability without a real source.
    requireAvailable(availability, field, goldId);

    if (entry.source === 'F4A_SCORING_SUPPLEMENT') {
      if (label === undefined) {
        fail(`the scoring supplement is available but carries no label for ${goldId}.`);
      }
      const goldClass = goldClassOf(label, field);
      gold[field] = goldClass;
      goldSource[field] = entry.source;
      if (goldClass === null) {
        // The label's own biconditional says this field is undefined here.
        fieldCorrectness[field] = 'NOT_APPLICABLE';
        continue;
      }
      if (NON_PREDICTED_GOLD_FIELDS.includes(field)) {
        // A denominator flag, reported but never graded against an answer.
        fieldCorrectness[field] = 'NOT_APPLICABLE';
        continue;
      }
      strictScorableFields.push(field);
      if (prediction === null) {
        // STRICT: a rejected item is incorrect, never absent.
        fieldCorrectness[field] = 'INCORRECT';
      } else {
        conditionalScorableFields.push(field);
        fieldCorrectness[field] =
          predictedClassOf(prediction, field) === goldClass ? 'CORRECT' : 'INCORRECT';
      }
      continue;
    }

    const goldValue = field === 'verdict' ? (preserved.verdictByGoldId.get(goldId) ?? null) : null;
    if (goldValue === null) {
      gold[field] = null;
      goldSource[field] = 'NONE';
      fieldCorrectness[field] = 'GOLD_UNAVAILABLE';
      continue;
    }
    gold[field] = goldValue;
    goldSource[field] = entry.source;
    strictScorableFields.push(field);
    if (prediction === null) {
      // STRICT: a rejected item is incorrect, never absent.
      fieldCorrectness[field] = 'INCORRECT';
    } else {
      conditionalScorableFields.push(field);
      const predicted = field === 'verdict' ? prediction.verdict : null;
      fieldCorrectness[field] = predicted === goldValue ? 'CORRECT' : 'INCORRECT';
    }
  }

  return { gold, goldSource, fieldCorrectness, strictScorableFields, conditionalScorableFields };
}

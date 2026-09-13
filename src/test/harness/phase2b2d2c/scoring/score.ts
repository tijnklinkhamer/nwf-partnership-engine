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
import type { GoldCorpusItem } from '../../../../orgunits/classify/evaluation/goldSchema.js';
import type { FrozenVariantName } from '../constants.js';
import { sha256Hex } from '../freeze.js';
import { GOLD_BACKED_FIELDS, requireAvailable, type GoldAvailability } from './gold.js';
import type { LoadedEvaluation, LoadedSources } from './sources.js';

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

export type FieldCorrectness = 'CORRECT' | 'INCORRECT' | 'GOLD_UNAVAILABLE' | 'NO_PREDICTION';

export interface ScoredItem {
  readonly goldId: string;
  readonly corpusLineNumber: number;
  readonly docIndex: number;
  readonly echeRowKey: string;
  readonly organisationId: string;
  readonly logicalBatchOrdinal: number;
  readonly positionWithinBatch: number;
  readonly sequence: number;
  readonly variantName: FrozenVariantName;
  readonly promptVersion: string;
  readonly promptSha256: string;
  readonly variantGitCommit: string;
  readonly finalInputSha256: string;
  readonly rawOutputSha256: string | null;
  readonly validationResultSha256: string;
  readonly finalRecordSha256: string;
  readonly validatorState: ValidatorState;
  readonly rejectionCategory: string | null;
  readonly rejectionReason: string | null;
  readonly prediction: PredictionFields | null;
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

/** goldId -> the gold verdict a DEVELOPMENT-only source preserves, when any does. */
export interface PreservedGold {
  readonly verdictByGoldId: ReadonlyMap<string, string>;
}

/**
 * Builds every scored row for one variant's twelve evaluations.
 *
 * Fails closed on a duplicate gold id, a missing or extra document, a
 * document claimed both accepted and rejected, and any non-DEVELOPMENT row.
 */
export function scoreVariant(
  sources: LoadedSources,
  variantName: FrozenVariantName,
  availability: GoldAvailability,
  preserved: PreservedGold,
): readonly ScoredItem[] {
  const corpusByGoldId = new Map<string, { row: GoldCorpusItem; line: number }>();
  sources.corpusRows.forEach((row, index) => {
    if (row.split !== 'DEVELOPMENT')
      fail(`corpus row ${row.goldId} is ${row.split}; only DEVELOPMENT is scorable.`);
    if (corpusByGoldId.has(row.goldId))
      fail(`duplicate gold id ${row.goldId} in the canonical corpus.`);
    corpusByGoldId.set(row.goldId, { row, line: index + 1 });
  });

  const rows: ScoredItem[] = [];
  const seen = new Set<string>();
  const evaluations = sources.evaluations.filter((e) => e.variantName === variantName);
  if (evaluations.length === 0) fail(`no evaluation found for variant ${variantName}.`);

  for (const evaluation of evaluations) {
    for (const [position, goldId] of evaluation.orderedGoldIds.entries()) {
      const docIndex = evaluation.orderedDocIndices[position];
      if (docIndex === undefined)
        fail(`${evaluation.attemptDirectory}: no docIndex at position ${position}.`);
      if (seen.has(goldId)) fail(`gold id ${goldId} appears twice under ${variantName}.`);
      seen.add(goldId);
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
  const validatorState: ValidatorState = acceptedEntry !== undefined ? 'ACCEPTED' : 'REJECTED';
  const prediction = acceptedEntry === undefined ? null : predictionOf(acceptedEntry.result);

  const gold: Record<string, string | null> = {};
  const goldSource: Record<string, string> = {};
  const fieldCorrectness: Record<string, FieldCorrectness> = {};
  const strictScorableFields: string[] = [];
  const conditionalScorableFields: string[] = [];

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
    rejectionCategory: rejectedEntry?.category ?? null,
    rejectionReason: rejectedEntry?.reason ?? null,
    prediction,
    gold,
    goldSource,
    fieldCorrectness,
    strictScorableFields,
    conditionalScorableFields,
  };
}

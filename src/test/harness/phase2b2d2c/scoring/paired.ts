/**
 * PHASE 2B-2D2C-F4 — PAIRED ATTRIBUTION, JOINED BY FROZEN ITEM IDENTITY.
 *
 * V1 and V2 are joined by `goldId` — NEVER by array position. Both variants
 * ran the same frozen corpus order, so position happens to agree today; a
 * position join would nonetheless be a latent defect the moment an ordering
 * ever changed, and a mutation test in this slice proves an identity
 * mismatch fails closed rather than silently mis-pairing.
 *
 * VALIDITY transitions and SEMANTIC transitions are kept apart. "Rejected
 * under v1, accepted under v2" is a statement about whether the output was
 * verifiable; "incorrect under v1, correct under v2" is a statement about
 * whether it was right. Collapsing them would let a prompt look better for
 * producing checkable-but-wrong answers.
 *
 * PURE. No network, no database, no filesystem, no clock, no randomness.
 */
import type { PredictionFields, ScoredItem } from './score.js';

export class PairingError extends Error {
  override readonly name = 'PairingError';
}

export type ValidityTransition =
  'ACCEPTED_TO_ACCEPTED' | 'REJECTED_TO_ACCEPTED' | 'ACCEPTED_TO_REJECTED' | 'REJECTED_TO_REJECTED';

export type CorrectnessTransition =
  | 'CORRECT_TO_CORRECT'
  | 'INCORRECT_TO_CORRECT'
  | 'CORRECT_TO_INCORRECT'
  | 'INCORRECT_TO_INCORRECT'
  | 'GOLD_UNAVAILABLE';

/** Whether the two variants gave the same structured answer — NOT whether either is right. */
export type Concordance = 'AGREE' | 'DISAGREE' | 'NOT_COMPARABLE';

export interface PairedItem {
  readonly goldId: string;
  readonly echeRowKey: string;
  readonly logicalBatchOrdinal: number;
  readonly docIndex: number;
  readonly corpusLineNumber: number;
  readonly v1: ScoredItem;
  readonly v2: ScoredItem;
  readonly validityTransition: ValidityTransition;
  /** Per gold-backed field; `GOLD_UNAVAILABLE` wherever no DEV-only gold exists. */
  readonly correctnessTransition: Readonly<Record<string, CorrectnessTransition>>;
  /** Per structured prediction field; gold-free agreement between the two variants. */
  readonly concordance: Readonly<Record<string, Concordance>>;
}

const CONCORDANCE_FIELDS: readonly (keyof PredictionFields)[] = [
  'verdict',
  'unit_type',
  'page_kind',
  'serves_incoming_international_students',
  'serves_outgoing_mobility_students',
  'provides_language_learning_or_support',
  'confidence',
  'unit_name_present',
  'unit_name_sha256',
];

function concordanceOf(
  a: PredictionFields | null,
  b: PredictionFields | null,
  field: keyof PredictionFields,
): Concordance {
  if (a === null || b === null) return 'NOT_COMPARABLE';
  return a[field] === b[field] ? 'AGREE' : 'DISAGREE';
}

function validityTransitionOf(v1: ScoredItem, v2: ScoredItem): ValidityTransition {
  if (v1.validatorState === 'ACCEPTED') {
    return v2.validatorState === 'ACCEPTED' ? 'ACCEPTED_TO_ACCEPTED' : 'ACCEPTED_TO_REJECTED';
  }
  return v2.validatorState === 'ACCEPTED' ? 'REJECTED_TO_ACCEPTED' : 'REJECTED_TO_REJECTED';
}

function correctnessTransitionOf(
  v1: ScoredItem,
  v2: ScoredItem,
  field: string,
): CorrectnessTransition {
  const a = v1.fieldCorrectness[field];
  const b = v2.fieldCorrectness[field];
  if (a === undefined || b === undefined) return 'GOLD_UNAVAILABLE';
  if (a === 'GOLD_UNAVAILABLE' || b === 'GOLD_UNAVAILABLE') return 'GOLD_UNAVAILABLE';
  if (a === 'NO_PREDICTION' || b === 'NO_PREDICTION') return 'GOLD_UNAVAILABLE';
  if (a === 'CORRECT') return b === 'CORRECT' ? 'CORRECT_TO_CORRECT' : 'CORRECT_TO_INCORRECT';
  return b === 'CORRECT' ? 'INCORRECT_TO_CORRECT' : 'INCORRECT_TO_INCORRECT';
}

/** Joins the two variants by gold id. Throws on any unmatched or duplicated identity. */
export function pairByIdentity(
  v1Rows: readonly ScoredItem[],
  v2Rows: readonly ScoredItem[],
): readonly PairedItem[] {
  const index = new Map<string, ScoredItem>();
  for (const row of v2Rows) {
    if (index.has(row.goldId))
      throw new PairingError(`duplicate gold id ${row.goldId} in the v2 rows.`);
    index.set(row.goldId, row);
  }
  const seen = new Set<string>();
  const paired: PairedItem[] = [];
  for (const v1 of v1Rows) {
    if (seen.has(v1.goldId))
      throw new PairingError(`duplicate gold id ${v1.goldId} in the v1 rows.`);
    seen.add(v1.goldId);
    const v2 = index.get(v1.goldId);
    if (v2 === undefined) throw new PairingError(`gold id ${v1.goldId} has no v2 counterpart.`);
    if (v1.docIndex !== v2.docIndex || v1.echeRowKey !== v2.echeRowKey) {
      throw new PairingError(`gold id ${v1.goldId}: item identity differs between the variants.`);
    }
    if (v1.finalInputSha256 === v2.finalInputSha256) {
      throw new PairingError(
        `gold id ${v1.goldId}: both variants report the same final input identity; ` +
          'the two prompts must produce different final inputs.',
      );
    }
    const correctnessTransition: Record<string, CorrectnessTransition> = {};
    for (const field of Object.keys(v1.fieldCorrectness)) {
      correctnessTransition[field] = correctnessTransitionOf(v1, v2, field);
    }
    const concordance: Record<string, Concordance> = {};
    for (const field of CONCORDANCE_FIELDS) {
      concordance[field] = concordanceOf(v1.prediction, v2.prediction, field);
    }
    paired.push({
      goldId: v1.goldId,
      echeRowKey: v1.echeRowKey,
      logicalBatchOrdinal: v1.logicalBatchOrdinal,
      docIndex: v1.docIndex,
      corpusLineNumber: v1.corpusLineNumber,
      v1,
      v2,
      validityTransition: validityTransitionOf(v1, v2),
      correctnessTransition,
      concordance,
    });
  }
  for (const goldId of index.keys()) {
    if (!seen.has(goldId)) throw new PairingError(`gold id ${goldId} has no v1 counterpart.`);
  }
  return paired.sort((a, b) => (a.goldId < b.goldId ? -1 : a.goldId > b.goldId ? 1 : 0));
}

export interface ValidityTransitionCounts {
  readonly ACCEPTED_TO_ACCEPTED: number;
  readonly REJECTED_TO_ACCEPTED: number;
  readonly ACCEPTED_TO_REJECTED: number;
  readonly REJECTED_TO_REJECTED: number;
  readonly total: number;
  /** Rejected under v1 only. */
  readonly v1OnlyRejection: number;
  /** Rejected under v2 only. */
  readonly v2OnlyRejection: number;
  readonly bothRejected: number;
  readonly netValidityChange: number;
}

export function countValidityTransitions(paired: readonly PairedItem[]): ValidityTransitionCounts {
  const counts = {
    ACCEPTED_TO_ACCEPTED: 0,
    REJECTED_TO_ACCEPTED: 0,
    ACCEPTED_TO_REJECTED: 0,
    REJECTED_TO_REJECTED: 0,
  };
  for (const item of paired) counts[item.validityTransition] += 1;
  return {
    ...counts,
    total: paired.length,
    v1OnlyRejection: counts.REJECTED_TO_ACCEPTED,
    v2OnlyRejection: counts.ACCEPTED_TO_REJECTED,
    bothRejected: counts.REJECTED_TO_REJECTED,
    netValidityChange: counts.REJECTED_TO_ACCEPTED - counts.ACCEPTED_TO_REJECTED,
  };
}

export interface CorrectnessTransitionCounts {
  readonly field: string;
  readonly CORRECT_TO_CORRECT: number;
  readonly INCORRECT_TO_CORRECT: number;
  readonly CORRECT_TO_INCORRECT: number;
  readonly INCORRECT_TO_INCORRECT: number;
  readonly GOLD_UNAVAILABLE: number;
  readonly recoveries: number;
  readonly regressions: number;
  readonly netStrictCorrectnessChange: number;
  readonly scorablePairs: number;
}

export function countCorrectnessTransitions(
  paired: readonly PairedItem[],
  field: string,
): CorrectnessTransitionCounts {
  const counts = {
    CORRECT_TO_CORRECT: 0,
    INCORRECT_TO_CORRECT: 0,
    CORRECT_TO_INCORRECT: 0,
    INCORRECT_TO_INCORRECT: 0,
    GOLD_UNAVAILABLE: 0,
  };
  for (const item of paired) {
    const transition = item.correctnessTransition[field] ?? 'GOLD_UNAVAILABLE';
    counts[transition] += 1;
  }
  return {
    field,
    ...counts,
    recoveries: counts.INCORRECT_TO_CORRECT,
    regressions: counts.CORRECT_TO_INCORRECT,
    netStrictCorrectnessChange: counts.INCORRECT_TO_CORRECT - counts.CORRECT_TO_INCORRECT,
    scorablePairs: paired.length - counts.GOLD_UNAVAILABLE,
  };
}

export interface ConcordanceCounts {
  readonly field: string;
  readonly agree: number;
  readonly disagree: number;
  readonly notComparable: number;
  readonly comparablePairs: number;
}

/** Gold-free: how often the two prompts gave the same structured answer. */
export function countConcordance(paired: readonly PairedItem[], field: string): ConcordanceCounts {
  let agree = 0;
  let disagree = 0;
  let notComparable = 0;
  for (const item of paired) {
    const value = item.concordance[field] ?? 'NOT_COMPARABLE';
    if (value === 'AGREE') agree += 1;
    else if (value === 'DISAGREE') disagree += 1;
    else notComparable += 1;
  }
  return { field, agree, disagree, notComparable, comparablePairs: agree + disagree };
}

export const CONCORDANCE_FIELD_NAMES: readonly string[] = CONCORDANCE_FIELDS.map(String);

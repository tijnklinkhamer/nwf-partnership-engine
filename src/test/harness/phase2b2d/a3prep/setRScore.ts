/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R10: PURE SET_R EXACT-DECIMAL K1/K2
 * SCORE REDUCER.
 *
 * One exact document in, ONE resolved SET_R score out, under the two owner
 * records bound in `contracts.ts`:
 *
 *   K1 (`K1_SET_R_TRACK_SCORE_MAX_V1`):
 *     pageSetRScore(row) = max(trackAScore, trackBScore)
 *   K2 (`K2_EXACT_DOCUMENT_SCORE_MAX_SOURCE_ROW_NO_REPRESENTATIVE_V1`):
 *     documentSetRScore = max(pageSetRScore(row) over every source row)
 *
 * which together (`SET_R_DOCUMENT_SCORE_MAX_PERSISTED_SIGNAL_EVIDENCE_V1`) is
 * the maximum persisted `candidate_score` over every (source row, required
 * track) observation of the document.
 *
 * EXACT DECIMALS, NEVER BINARY FLOATING POINT
 *
 *   The persisted column is a SIGNED `numeric(8,4)`: every value is an integer
 *   multiple of 0.0001 in [-9999.9999, 9999.9999]. A score is parsed from its
 *   decimal TEXT straight into an integer count of 0.0001 units (a `bigint`),
 *   and compared as that integer. No `Number`, no `parseFloat`, no epsilon.
 *   The scaled integer is a representation mechanism, not a new scoring rule,
 *   and it never leaves this module.
 *
 *   The K1 record pins the numeric VALUE, not a driver's spelling
 *   (`textualSerializationPinned: false`: a future implementation "may
 *   canonicalise or validate the decimal representation mechanically but may
 *   not alter the numeric value"). So any plain base-10 spelling of a
 *   numeric(8,4) value is accepted - a sign, leading zeros, fewer than four
 *   fractional digits, or trailing ZERO digits past the fourth - and is emitted
 *   in ONE canonical form: no `+`, `-` only below zero, no redundant leading
 *   zero, exactly four fractional digits. `1.23001` is not a numeric(8,4)
 *   value and is refused, never rounded.
 *
 * NO REPRESENTATIVE
 *
 *   A document's score is a number. No source row, track or page id that
 *   happens to supply the maximum is carried as a winner, and a numeric tie
 *   stays a tie. Every source row and both of its required-track observations
 *   stay in the returned PROVENANCE, in a fixed serialisation order - the
 *   document's own `sourcePageEvidenceIds`, then INTERNATIONAL_OFFICE before
 *   LANGUAGE_CENTRE - which is never a ranking key.
 *
 * WHAT THIS MODULE DOES NOT DO
 *
 *   - It does not recompute a candidate signal: it READS persisted scores the
 *     caller supplies, already joined, and never imports the production scorer.
 *   - It does not rank, tie-break, hash or cap: no SET_R order, no salted key,
 *     no per-organisation limit. It stops at one score per document.
 *   - It does not run SD7, compose with survivors, touch short-text policy,
 *     evaluate SD9 or decide K4.
 *   - It reads no database and adapts no real row shape.
 *
 * Refusals carry a code, a field name and array positions only - never a
 * caller-supplied score text, id or hash.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read, no hashing. It mutates no input.
 */
import {
  K1_OWNER_DECISION,
  K2_OWNER_DECISION,
  SET_R_BOUND_SIGNAL_RULE_VERSION,
  SET_R_REQUIRED_TRACKS,
} from './contracts.js';
import type {
  A3DistinctDocument,
  A3DocumentSha256,
  A3ExternallyResolvedSetRScore,
  A3PageEvidenceId,
  A3PersistedCandidateTrack,
  A3TrackCandidateObservation,
} from './types.js';

// ---------------------------------------------------------------------------
// REFUSALS
// ---------------------------------------------------------------------------

/**
 * Where the K2 owner record names an integrity defect, its own token is used
 * byte-for-byte (`integrityPolicy.refuseRatherThanRepair`). The remaining
 * codes cover the collection structure K2 presupposes.
 */
export type A3SetRScoreRefusalCode =
  // Collection structure.
  | 'MALFORMED_DOCUMENT_SCORE_INPUT'
  | 'DOCUMENT_SOURCE_PAGE_EVIDENCE_IDS_EMPTY'
  | 'DUPLICATE_DOCUMENT_SOURCE_PAGE_EVIDENCE_ID'
  | 'MALFORMED_SOURCE_ROW'
  | 'MISSING_SOURCE_ROW'
  | 'DUPLICATE_SOURCE_ROW'
  | 'EXTRA_SOURCE_ROW'
  | 'MALFORMED_CANDIDATE_OBSERVATION'
  // K2 integrity tokens.
  | 'FETCH_DOCUMENT_SHA_MISMATCH'
  | 'CANDIDATE_OBSERVATION_FOR_PAGE_OUTSIDE_DOCUMENT_SOURCE_GROUP'
  | 'MISSING_TRACK_A'
  | 'MISSING_TRACK_B'
  | 'DUPLICATE_REQUIRED_TRACK_OBSERVATION'
  | 'UNEXPECTED_CANDIDATE_TRACK'
  | 'UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION'
  | 'MALFORMED_PERSISTED_SCORE_VALUE'
  // The numeric(8,4) value domain.
  | 'PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN';

export interface A3SetRScoreRefusalLocation {
  /** The input field at fault, by name - never its value. */
  readonly field: string | null;
  /** Position in `document.sourcePageEvidenceIds`. */
  readonly documentSourcePosition: number | null;
  /** Position in the caller's `sourceRows` array. */
  readonly sourceRowPosition: number | null;
  /** Position in that row's `candidateObservations` array. */
  readonly observationPosition: number | null;
}

/** Malformed or incomplete score evidence is refused, never repaired. */
export class A3SetRScoreRefusal extends Error {
  readonly code: A3SetRScoreRefusalCode;
  readonly location: A3SetRScoreRefusalLocation;

  constructor(code: A3SetRScoreRefusalCode, location: Partial<A3SetRScoreRefusalLocation> = {}) {
    const resolved: A3SetRScoreRefusalLocation = Object.freeze({
      field: location.field ?? null,
      documentSourcePosition: location.documentSourcePosition ?? null,
      sourceRowPosition: location.sourceRowPosition ?? null,
      observationPosition: location.observationPosition ?? null,
    });
    super(
      `SET_R score refused: ${code}` +
        (resolved.field === null ? '' : ` field=${resolved.field}`) +
        (resolved.documentSourcePosition === null
          ? ''
          : ` documentSourcePosition=${resolved.documentSourcePosition}`) +
        (resolved.sourceRowPosition === null
          ? ''
          : ` sourceRowPosition=${resolved.sourceRowPosition}`) +
        (resolved.observationPosition === null
          ? ''
          : ` observationPosition=${resolved.observationPosition}`),
    );
    this.name = 'A3SetRScoreRefusal';
    this.code = code;
    this.location = resolved;
  }
}

// ---------------------------------------------------------------------------
// EXACT numeric(8,4) DECIMALS
// ---------------------------------------------------------------------------

declare const A3_CANONICAL_NUMERIC_8_4_BRAND: unique symbol;

/**
 * A numeric(8,4) value in its ONE canonical spelling: optional `-` (only below
 * zero), an integer part with no redundant leading zero, `.`, exactly four
 * fractional digits. Only `canonicaliseNumeric84Decimal` produces one.
 */
export type A3CanonicalNumeric84Decimal = string & {
  readonly [A3_CANONICAL_NUMERIC_8_4_BRAND]: 'numeric(8,4)';
};

const NUMERIC_8_4_SCALE_DIGITS = 4;
const NUMERIC_8_4_MAX_INTEGER_DIGITS = 4;
const NUMERIC_8_4_UNITS_PER_ONE = 10_000n;

/**
 * Plain base-10: optional sign, at least one integer digit, and optionally a
 * point followed by at least one digit. ASCII digits only - no whitespace,
 * exponent, separator, NaN or Infinity can match.
 */
const PLAIN_DECIMAL = /^([+-]?)([0-9]+)(?:\.([0-9]+))?$/;

/** The value as an exact integer count of 0.0001 units. Never escapes this module. */
function parseNumeric84Units(text: unknown, location: Partial<A3SetRScoreRefusalLocation>): bigint {
  if (typeof text !== 'string') {
    throw new A3SetRScoreRefusal('MALFORMED_PERSISTED_SCORE_VALUE', location);
  }
  const match = PLAIN_DECIMAL.exec(text);
  if (match === null) throw new A3SetRScoreRefusal('MALFORMED_PERSISTED_SCORE_VALUE', location);
  const sign = match[1] ?? '';
  const integerDigits = (match[2] ?? '').replace(/^0+(?=[0-9])/, '');
  const fractionDigits = match[3] ?? '';
  if (/[^0]/.test(fractionDigits.slice(NUMERIC_8_4_SCALE_DIGITS))) {
    // Not an integer multiple of 0.0001: not a numeric(8,4) value at all.
    throw new A3SetRScoreRefusal('PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN', location);
  }
  if (integerDigits.length > NUMERIC_8_4_MAX_INTEGER_DIGITS) {
    throw new A3SetRScoreRefusal('PERSISTED_SCORE_OUTSIDE_NUMERIC_8_4_DOMAIN', location);
  }
  const scaledFraction = fractionDigits
    .slice(0, NUMERIC_8_4_SCALE_DIGITS)
    .padEnd(NUMERIC_8_4_SCALE_DIGITS, '0');
  const magnitude = BigInt(integerDigits + scaledFraction);
  return sign === '-' ? -magnitude : magnitude;
}

function formatNumeric84Units(units: bigint): A3CanonicalNumeric84Decimal {
  const negative = units < 0n;
  const magnitude = negative ? -units : units;
  const integerPart = (magnitude / NUMERIC_8_4_UNITS_PER_ONE).toString();
  const fractionPart = (magnitude % NUMERIC_8_4_UNITS_PER_ONE)
    .toString()
    .padStart(NUMERIC_8_4_SCALE_DIGITS, '0');
  return `${negative ? '-' : ''}${integerPart}.${fractionPart}` as A3CanonicalNumeric84Decimal;
}

/**
 * Validate one plain decimal spelling of a numeric(8,4) value and return its
 * canonical spelling. The numeric value is never altered: `1`, `001.2`,
 * `1.23000` and `-0` become `1.0000`, `1.2000`, `1.2300` and `0.0000`.
 */
export function canonicaliseNumeric84Decimal(text: string): A3CanonicalNumeric84Decimal {
  return formatNumeric84Units(parseNumeric84Units(text, { field: 'decimal' }));
}

/**
 * Exact three-way comparison of two numeric(8,4) values by VALUE: negative
 * below zero below positive, and 0 for equal values however they are spelled.
 */
export function compareNumeric84Decimal(left: string, right: string): -1 | 0 | 1 {
  const l = parseNumeric84Units(left, { field: 'left' });
  const r = parseNumeric84Units(right, { field: 'right' });
  return l < r ? -1 : l > r ? 1 : 0;
}

// ---------------------------------------------------------------------------
// INPUT SHAPES — already-joined, caller-supplied, never a database row
// ---------------------------------------------------------------------------

/**
 * One source page-evidence row of an exact document, with its persisted
 * per-track candidate observations. `documentSha256` is the hash joined
 * through THIS row's own fetch observation, so the reducer can prove the row
 * really belongs to the document group (K2's `FETCH_DOCUMENT_SHA_MISMATCH`).
 */
export interface A3SetRSourcePageScoreInput {
  readonly pageEvidenceId: A3PageEvidenceId;
  readonly documentSha256: A3DocumentSha256;
  readonly candidateObservations: readonly A3TrackCandidateObservation[];
}

/** One exact document and exactly one score input per source page-evidence row. */
export interface A3SetRDocumentScoreInput {
  readonly document: A3DistinctDocument;
  readonly sourceRows: readonly A3SetRSourcePageScoreInput[];
}

// ---------------------------------------------------------------------------
// OUTPUT — internal pre-label preparation, never a ranked or public shape
// ---------------------------------------------------------------------------

export const A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND =
  'A3_SET_R_DOCUMENT_SCORE_PREPARATION_NOT_RANKED_NOT_PUBLIC_MANIFEST';

/** One persisted required-track observation, score canonicalised. */
export interface A3SetRTrackScoreProvenance {
  readonly track: A3PersistedCandidateTrack;
  readonly candidateScoreDecimal: A3CanonicalNumeric84Decimal;
  readonly ruleVersion: typeof SET_R_BOUND_SIGNAL_RULE_VERSION;
}

/** One source row: both required tracks in fixed order, and its K1 score. */
export interface A3SetRSourceRowScoreProvenance {
  readonly pageEvidenceId: A3PageEvidenceId;
  /** Exactly two entries: INTERNATIONAL_OFFICE, then LANGUAGE_CENTRE. */
  readonly trackScores: readonly A3SetRTrackScoreProvenance[];
  /** K1: max over `trackScores`. A number, not a chosen track. */
  readonly pageSetRScoreDecimal: A3CanonicalNumeric84Decimal;
}

export interface A3SetRDocumentScorePreparation {
  readonly kind: typeof A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND;
  readonly documentSha256: A3DocumentSha256;
  /** A copy of the document's own list, in its own order. */
  readonly sourcePageEvidenceIds: readonly A3PageEvidenceId[];
  /** One entry per source page-evidence id, in `sourcePageEvidenceIds` order. */
  readonly sourceRowScores: readonly A3SetRSourceRowScoreProvenance[];
  /** K2: max over every row's K1 score, bound to both owner records. */
  readonly resolvedScore: A3ExternallyResolvedSetRScore;
}

// ---------------------------------------------------------------------------
// VALIDATION
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

interface ValidatedRow {
  readonly sourceRowPosition: number;
  readonly observations: readonly unknown[];
}

/** Structure, document hash and exact coverage of `document.sourcePageEvidenceIds`. */
function validateSourceGroup(input: unknown): {
  readonly documentSha256: A3DocumentSha256;
  readonly sourceIds: readonly A3PageEvidenceId[];
  readonly rowsById: ReadonlyMap<string, ValidatedRow>;
} {
  if (!isRecord(input)) {
    throw new A3SetRScoreRefusal('MALFORMED_DOCUMENT_SCORE_INPUT', { field: 'input' });
  }
  const document = input['document'];
  if (!isRecord(document)) {
    throw new A3SetRScoreRefusal('MALFORMED_DOCUMENT_SCORE_INPUT', { field: 'document' });
  }
  const documentSha256 = document['documentSha256'];
  if (!isNonEmptyString(documentSha256)) {
    throw new A3SetRScoreRefusal('MALFORMED_DOCUMENT_SCORE_INPUT', {
      field: 'document.documentSha256',
    });
  }
  const sourceIds = document['sourcePageEvidenceIds'];
  if (!Array.isArray(sourceIds)) {
    throw new A3SetRScoreRefusal('MALFORMED_DOCUMENT_SCORE_INPUT', {
      field: 'document.sourcePageEvidenceIds',
    });
  }
  if (sourceIds.length === 0) {
    throw new A3SetRScoreRefusal('DOCUMENT_SOURCE_PAGE_EVIDENCE_IDS_EMPTY', {
      field: 'document.sourcePageEvidenceIds',
    });
  }
  const sourcePositionById = new Map<string, number>();
  for (let position = 0; position < sourceIds.length; position += 1) {
    const id: unknown = sourceIds[position];
    if (!isNonEmptyString(id)) {
      throw new A3SetRScoreRefusal('MALFORMED_DOCUMENT_SCORE_INPUT', {
        field: 'document.sourcePageEvidenceIds',
        documentSourcePosition: position,
      });
    }
    if (sourcePositionById.has(id)) {
      throw new A3SetRScoreRefusal('DUPLICATE_DOCUMENT_SOURCE_PAGE_EVIDENCE_ID', {
        field: 'document.sourcePageEvidenceIds',
        documentSourcePosition: position,
      });
    }
    sourcePositionById.set(id, position);
  }

  const sourceRows = input['sourceRows'];
  if (!Array.isArray(sourceRows)) {
    throw new A3SetRScoreRefusal('MALFORMED_DOCUMENT_SCORE_INPUT', { field: 'sourceRows' });
  }
  const rowsById = new Map<string, ValidatedRow>();
  for (let position = 0; position < sourceRows.length; position += 1) {
    const row: unknown = sourceRows[position];
    if (!isRecord(row)) {
      throw new A3SetRScoreRefusal('MALFORMED_SOURCE_ROW', { sourceRowPosition: position });
    }
    const pageEvidenceId = row['pageEvidenceId'];
    if (!isNonEmptyString(pageEvidenceId)) {
      throw new A3SetRScoreRefusal('MALFORMED_SOURCE_ROW', {
        field: 'pageEvidenceId',
        sourceRowPosition: position,
      });
    }
    const rowDocumentSha256 = row['documentSha256'];
    if (!isNonEmptyString(rowDocumentSha256)) {
      throw new A3SetRScoreRefusal('MALFORMED_SOURCE_ROW', {
        field: 'documentSha256',
        sourceRowPosition: position,
      });
    }
    const observations = row['candidateObservations'];
    if (!Array.isArray(observations)) {
      throw new A3SetRScoreRefusal('MALFORMED_SOURCE_ROW', {
        field: 'candidateObservations',
        sourceRowPosition: position,
      });
    }
    if (!sourcePositionById.has(pageEvidenceId)) {
      throw new A3SetRScoreRefusal('EXTRA_SOURCE_ROW', {
        field: 'pageEvidenceId',
        sourceRowPosition: position,
      });
    }
    if (rowsById.has(pageEvidenceId)) {
      throw new A3SetRScoreRefusal('DUPLICATE_SOURCE_ROW', {
        field: 'pageEvidenceId',
        documentSourcePosition: sourcePositionById.get(pageEvidenceId) ?? null,
        sourceRowPosition: position,
      });
    }
    if (rowDocumentSha256 !== documentSha256) {
      throw new A3SetRScoreRefusal('FETCH_DOCUMENT_SHA_MISMATCH', {
        field: 'documentSha256',
        documentSourcePosition: sourcePositionById.get(pageEvidenceId) ?? null,
        sourceRowPosition: position,
      });
    }
    rowsById.set(pageEvidenceId, { sourceRowPosition: position, observations });
  }
  for (let position = 0; position < sourceIds.length; position += 1) {
    if (!rowsById.has(sourceIds[position] as string)) {
      throw new A3SetRScoreRefusal('MISSING_SOURCE_ROW', {
        field: 'sourceRows',
        documentSourcePosition: position,
      });
    }
  }
  return {
    documentSha256: documentSha256 as A3DocumentSha256,
    sourceIds: sourceIds as readonly A3PageEvidenceId[],
    rowsById,
  };
}

/**
 * Exactly one observation per required track, each of this page, each under
 * the bound rule version, each a numeric(8,4) value. Returns the scaled
 * values in the fixed required-track order.
 */
function validateRequiredTrackScores(
  pageEvidenceId: string,
  row: ValidatedRow,
  documentSourcePosition: number,
): readonly bigint[] {
  const byTrack = new Map<string, bigint>();
  const base = { documentSourcePosition, sourceRowPosition: row.sourceRowPosition };
  for (let position = 0; position < row.observations.length; position += 1) {
    const at = { ...base, observationPosition: position };
    const observation: unknown = row.observations[position];
    if (!isRecord(observation)) {
      throw new A3SetRScoreRefusal('MALFORMED_CANDIDATE_OBSERVATION', at);
    }
    if (observation['pageEvidenceId'] !== pageEvidenceId) {
      throw new A3SetRScoreRefusal('CANDIDATE_OBSERVATION_FOR_PAGE_OUTSIDE_DOCUMENT_SOURCE_GROUP', {
        ...at,
        field: 'pageEvidenceId',
      });
    }
    const track = observation['track'];
    if (
      typeof track !== 'string' ||
      !(SET_R_REQUIRED_TRACKS as readonly string[]).includes(track)
    ) {
      throw new A3SetRScoreRefusal('UNEXPECTED_CANDIDATE_TRACK', { ...at, field: 'track' });
    }
    if (observation['ruleVersion'] !== SET_R_BOUND_SIGNAL_RULE_VERSION) {
      throw new A3SetRScoreRefusal('UNEXPECTED_OR_MIXED_SIGNAL_RULE_VERSION', {
        ...at,
        field: 'ruleVersion',
      });
    }
    if (byTrack.has(track)) {
      throw new A3SetRScoreRefusal('DUPLICATE_REQUIRED_TRACK_OBSERVATION', {
        ...at,
        field: 'track',
      });
    }
    byTrack.set(
      track,
      parseNumeric84Units(observation['candidateScoreDecimal'], {
        ...at,
        field: 'candidateScoreDecimal',
      }),
    );
  }
  const [trackA, trackB] = SET_R_REQUIRED_TRACKS;
  const trackAUnits = byTrack.get(trackA);
  if (trackAUnits === undefined) {
    throw new A3SetRScoreRefusal('MISSING_TRACK_A', { ...base, field: 'candidateObservations' });
  }
  const trackBUnits = byTrack.get(trackB);
  if (trackBUnits === undefined) {
    throw new A3SetRScoreRefusal('MISSING_TRACK_B', { ...base, field: 'candidateObservations' });
  }
  return [trackAUnits, trackBUnits];
}

/** The larger of two exact values. Which operand supplied it is not recorded. */
function maxUnits(left: bigint, right: bigint): bigint {
  return right > left ? right : left;
}

// ---------------------------------------------------------------------------
// THE REDUCER
// ---------------------------------------------------------------------------

/**
 * Validate one exact document's complete source group fail closed, then
 * reduce it: K1 MAX across the two required tracks of every source row, K2 MAX
 * across the rows. Returns the resolved score with complete, fixed-order
 * provenance. Never ranks, never picks a representative.
 */
export function prepareSetRDocumentScore(
  input: A3SetRDocumentScoreInput,
): A3SetRDocumentScorePreparation {
  const { documentSha256, sourceIds, rowsById } = validateSourceGroup(input);

  const sourceRowScores: A3SetRSourceRowScoreProvenance[] = [];
  let documentUnits: bigint | null = null;
  for (let position = 0; position < sourceIds.length; position += 1) {
    const pageEvidenceId = sourceIds[position] as A3PageEvidenceId;
    const row = rowsById.get(pageEvidenceId) as ValidatedRow;
    const trackUnits = validateRequiredTrackScores(pageEvidenceId, row, position);

    // K1: max across the two required tracks. No addition, clamp or priority.
    const pageUnits = maxUnits(trackUnits[0] as bigint, trackUnits[1] as bigint);
    // K2: max across source rows. Multiplicity carries no weight.
    documentUnits = documentUnits === null ? pageUnits : maxUnits(documentUnits, pageUnits);

    sourceRowScores.push(
      Object.freeze({
        pageEvidenceId,
        trackScores: Object.freeze(
          SET_R_REQUIRED_TRACKS.map((track, index) =>
            Object.freeze({
              track,
              candidateScoreDecimal: formatNumeric84Units(trackUnits[index] as bigint),
              ruleVersion: SET_R_BOUND_SIGNAL_RULE_VERSION,
            }),
          ),
        ),
        pageSetRScoreDecimal: formatNumeric84Units(pageUnits),
      }),
    );
  }

  const resolvedScore: A3ExternallyResolvedSetRScore = Object.freeze({
    documentSha256,
    resolvedScoreDecimal: formatNumeric84Units(documentUnits as bigint),
    k1TrackReductionDecisionRecordSha256: K1_OWNER_DECISION.decisionRecordSha256,
    k2ExactDuplicateDecisionRecordSha256: K2_OWNER_DECISION.decisionRecordSha256,
  });

  return Object.freeze({
    kind: A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND,
    documentSha256,
    sourcePageEvidenceIds: Object.freeze([...sourceIds]),
    sourceRowScores: Object.freeze(sourceRowScores),
    resolvedScore,
  });
}

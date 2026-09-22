/**
 * PHASE 2B-2D — A3 CANONICAL PREPARATION, R11: PURE SET_R TOTAL RANK OVER R10
 * RESOLVED DOCUMENT SCORES.
 *
 * SET_R RANKING OVER A CALLER-SUPPLIED PRE-SURVIVOR EXACT-DISTINCT POOL.
 * This is NOT Generation-1 SET_R materialisation.
 *
 * THE FROZEN ORDER (R3 SD3, bound in `contracts.ts`), AND NOTHING ELSE
 *
 *   PRIMARY   (`SET_R_PRIMARY_ORDER`): the resolved K1/K2 document score,
 *             DESCENDING, compared by exact numeric(8,4) value through R10's
 *             `compareNumeric84Decimal` - never as text, never as a float.
 *   SECONDARY (`SET_R_TIE_BREAK_ORDER`): sha256("SET_R_V2_R2:" +
 *             documentSha256), lower-case hex, plain code-unit ASCENDING,
 *             built by R2's `prefixedDocumentRankHash` from the WHOLE frozen
 *             prefix with nothing inserted.
 *
 *   There is no tertiary key. Two different documents that tie on score AND
 *   share a salted digest are refused by `assertUniqueRankDigests` before any
 *   sort, so the comparator never returns 0 for two valid entries and caller
 *   order can never become a hidden third key.
 *
 * ONE ENTRY = ONE EXACT DOCUMENT + THE R10 PREPARATION MADE FOR THAT GROUP
 *
 *   The same `documentSha256` can occur in two organisations with DIFFERENT
 *   R10 scores, because a persisted candidate score also reads URL-path
 *   evidence. A bare list of scores keyed by SHA could therefore be
 *   transplanted from one organisation's group onto another's. So every
 *   input pairs an `A3DistinctDocument` with its `A3SetRDocumentScorePreparation`,
 *   and the pairing is re-bound before anything is ranked:
 *
 *     - the preparation's kind is R10's;
 *     - document, preparation and resolved score name the same SHA;
 *     - the preparation's `sourcePageEvidenceIds` equal the document's
 *       position by position (R10 copies the document's own order), and each
 *       `sourceRowScores[i].pageEvidenceId` is the document's i-th id;
 *     - the resolved score is bound to the current K1 and K2 record hashes;
 *     - the resolved score is already in R10's one canonical spelling.
 *
 *   That is provenance binding, not score recomputation: this module never
 *   reads a track score or a per-row score, never reduces anything, and never
 *   decides whether R10 chose correctly.
 *
 * FULL RANK ONLY. Every input document appears exactly once, at a 0-based
 * `rankPosition`. No per-organisation cap is applied here: SD7's
 * sample-specific survivor walk runs over this pre-SD7 order first, and the
 * cap belongs after it (R12 and later).
 *
 * The output is R1's identity-and-position `A3RankedDocument` pinned to
 * `SET_R`. It carries no score, no source page-evidence id and no K1/K2
 * provenance: R10's preparation stays the audit evidence for the score.
 *
 * Refusals name a code, a field and positions only - never a document SHA,
 * a page-evidence id, a score or any other caller string.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read. It mutates no input.
 */
import { K1_OWNER_DECISION, K2_OWNER_DECISION, SET_R_TIE_BREAK_KEY_PREFIX } from './contracts.js';
import {
  assertLowerHexDocumentSha256s,
  assertSingleSlotAndSplit,
  assertUniqueDocumentSha256s,
  assertUniqueRankDigests,
  comparePlainLexicographic,
  prefixedDocumentRankHash,
} from './rank.js';
import {
  A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND,
  A3SetRScoreRefusal,
  canonicaliseNumeric84Decimal,
  compareNumeric84Decimal,
  type A3SetRDocumentScorePreparation,
} from './setRScore.js';
import type { A3DistinctDocument, A3RankedDocument } from './types.js';

// ---------------------------------------------------------------------------
// SHAPES
// ---------------------------------------------------------------------------

/** One exact document and the R10 preparation produced for that exact group. */
export interface A3SetRRankInput {
  readonly document: A3DistinctDocument;
  readonly scorePreparation: A3SetRDocumentScorePreparation;
}

/** A SET_R-ranked document: R1's ranked shape, pinned to the SET_R sample. */
export type A3SetRRankedDocument = A3RankedDocument & { readonly sample: 'SET_R' };

// ---------------------------------------------------------------------------
// REFUSALS
// ---------------------------------------------------------------------------

export type A3SetRRankRefusalCode =
  | 'MALFORMED_SET_R_RANK_INPUT'
  | 'SCORE_PREPARATION_KIND_MISMATCH'
  | 'SCORE_PREPARATION_DOCUMENT_SHA_MISMATCH'
  | 'SCORE_PREPARATION_SOURCE_PROVENANCE_MISMATCH'
  | 'SCORE_PREPARATION_SOURCE_ROW_PROVENANCE_MISMATCH'
  | 'K1_DECISION_BINDING_MISMATCH'
  | 'K2_DECISION_BINDING_MISMATCH'
  | 'RESOLVED_SCORE_NOT_CANONICAL_NUMERIC_8_4';

export interface A3SetRRankRefusalLocation {
  /** The input field at fault, by name - never its value. */
  readonly field: string | null;
  /** Position in the caller's input array. */
  readonly inputPosition: number | null;
  /** Position in the document's `sourcePageEvidenceIds`. */
  readonly provenancePosition: number | null;
}

/**
 * An R11 binding failure. Canonical rank-helper failures (identity shape,
 * uniqueness, slot/split scope, digest collision) keep R2's `A3RankStop`.
 */
export class A3SetRRankRefusal extends Error {
  readonly code: A3SetRRankRefusalCode;
  readonly location: A3SetRRankRefusalLocation;

  constructor(code: A3SetRRankRefusalCode, location: Partial<A3SetRRankRefusalLocation> = {}) {
    const resolved: A3SetRRankRefusalLocation = Object.freeze({
      field: location.field ?? null,
      inputPosition: location.inputPosition ?? null,
      provenancePosition: location.provenancePosition ?? null,
    });
    super(
      `SET_R rank refused: ${code}` +
        (resolved.field === null ? '' : ` field=${resolved.field}`) +
        (resolved.inputPosition === null ? '' : ` inputPosition=${resolved.inputPosition}`) +
        (resolved.provenancePosition === null
          ? ''
          : ` provenancePosition=${resolved.provenancePosition}`),
    );
    this.name = 'A3SetRRankRefusal';
    this.code = code;
    this.location = resolved;
  }
}

// ---------------------------------------------------------------------------
// BINDING
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Re-bind one entry's R10 preparation to its exact document. Returns the
 * resolved score text only after every binding check has passed.
 */
function bindScorePreparation(entry: unknown, inputPosition: number): string {
  const at = (field: string, provenancePosition?: number) => ({
    field,
    inputPosition,
    ...(provenancePosition === undefined ? {} : { provenancePosition }),
  });

  if (!isRecord(entry)) {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', at('input'));
  }
  const document = entry['document'];
  if (!isRecord(document)) {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', at('document'));
  }
  const preparation = entry['scorePreparation'];
  if (!isRecord(preparation)) {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', at('scorePreparation'));
  }
  if (preparation['kind'] !== A3_SET_R_DOCUMENT_SCORE_PREPARATION_KIND) {
    throw new A3SetRRankRefusal('SCORE_PREPARATION_KIND_MISMATCH', at('scorePreparation.kind'));
  }
  const resolvedScore = preparation['resolvedScore'];
  if (!isRecord(resolvedScore)) {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', at('scorePreparation.resolvedScore'));
  }

  // Document identity: all three must name the same SHA.
  const documentSha256 = document['documentSha256'];
  if (typeof documentSha256 !== 'string') {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', at('document.documentSha256'));
  }
  if (preparation['documentSha256'] !== documentSha256) {
    throw new A3SetRRankRefusal(
      'SCORE_PREPARATION_DOCUMENT_SHA_MISMATCH',
      at('scorePreparation.documentSha256'),
    );
  }
  if (resolvedScore['documentSha256'] !== documentSha256) {
    throw new A3SetRRankRefusal(
      'SCORE_PREPARATION_DOCUMENT_SHA_MISMATCH',
      at('scorePreparation.resolvedScore.documentSha256'),
    );
  }

  // Source provenance: the same ids, at the same positions.
  const documentIds = document['sourcePageEvidenceIds'];
  if (!Array.isArray(documentIds)) {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', at('document.sourcePageEvidenceIds'));
  }
  const preparationIds = preparation['sourcePageEvidenceIds'];
  if (!Array.isArray(preparationIds)) {
    throw new A3SetRRankRefusal(
      'MALFORMED_SET_R_RANK_INPUT',
      at('scorePreparation.sourcePageEvidenceIds'),
    );
  }
  if (preparationIds.length !== documentIds.length) {
    throw new A3SetRRankRefusal(
      'SCORE_PREPARATION_SOURCE_PROVENANCE_MISMATCH',
      at('scorePreparation.sourcePageEvidenceIds'),
    );
  }
  for (let position = 0; position < documentIds.length; position += 1) {
    if (preparationIds[position] !== documentIds[position]) {
      throw new A3SetRRankRefusal(
        'SCORE_PREPARATION_SOURCE_PROVENANCE_MISMATCH',
        at('scorePreparation.sourcePageEvidenceIds', position),
      );
    }
  }

  // Provenance rows: one per source id, in the same order. Identity only -
  // nothing inside a row is read.
  const rows = preparation['sourceRowScores'];
  if (!Array.isArray(rows)) {
    throw new A3SetRRankRefusal(
      'MALFORMED_SET_R_RANK_INPUT',
      at('scorePreparation.sourceRowScores'),
    );
  }
  if (rows.length !== documentIds.length) {
    throw new A3SetRRankRefusal(
      'SCORE_PREPARATION_SOURCE_ROW_PROVENANCE_MISMATCH',
      at('scorePreparation.sourceRowScores'),
    );
  }
  for (let position = 0; position < documentIds.length; position += 1) {
    const row: unknown = rows[position];
    if (!isRecord(row) || row['pageEvidenceId'] !== documentIds[position]) {
      throw new A3SetRRankRefusal(
        'SCORE_PREPARATION_SOURCE_ROW_PROVENANCE_MISMATCH',
        at('scorePreparation.sourceRowScores', position),
      );
    }
  }

  // Owner-decision binding.
  if (
    resolvedScore['k1TrackReductionDecisionRecordSha256'] !== K1_OWNER_DECISION.decisionRecordSha256
  ) {
    throw new A3SetRRankRefusal(
      'K1_DECISION_BINDING_MISMATCH',
      at('scorePreparation.resolvedScore.k1TrackReductionDecisionRecordSha256'),
    );
  }
  if (
    resolvedScore['k2ExactDuplicateDecisionRecordSha256'] !== K2_OWNER_DECISION.decisionRecordSha256
  ) {
    throw new A3SetRRankRefusal(
      'K2_DECISION_BINDING_MISMATCH',
      at('scorePreparation.resolvedScore.k2ExactDuplicateDecisionRecordSha256'),
    );
  }

  // The score must already be R10's canonical spelling; it is never
  // canonicalised on the caller's behalf.
  const scoreField = 'scorePreparation.resolvedScore.resolvedScoreDecimal';
  const resolvedScoreDecimal = resolvedScore['resolvedScoreDecimal'];
  if (typeof resolvedScoreDecimal !== 'string') {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', at(scoreField));
  }
  let canonical: string;
  try {
    canonical = canonicaliseNumeric84Decimal(resolvedScoreDecimal);
  } catch (error) {
    if (error instanceof A3SetRScoreRefusal) {
      throw new A3SetRRankRefusal('RESOLVED_SCORE_NOT_CANONICAL_NUMERIC_8_4', at(scoreField));
    }
    throw error;
  }
  if (canonical !== resolvedScoreDecimal) {
    throw new A3SetRRankRefusal('RESOLVED_SCORE_NOT_CANONICAL_NUMERIC_8_4', at(scoreField));
  }
  return resolvedScoreDecimal;
}

// ---------------------------------------------------------------------------
// THE RANK
// ---------------------------------------------------------------------------

/**
 * The complete, deterministic SET_R order of one selection slot's
 * caller-supplied pool: resolved score descending, then the salted
 * `SET_R_V2_R2:` digest ascending, and nothing else.
 *
 * Fails closed on a malformed or mis-bound score preparation, a malformed or
 * repeated document identity, a pool spanning more than one slot or split, or
 * a salted-digest collision. Input order has no effect on the output. Empty
 * input returns an empty rank.
 */
export function rankSetRFull(entries: readonly A3SetRRankInput[]): readonly A3SetRRankedDocument[] {
  if (!Array.isArray(entries)) {
    throw new A3SetRRankRefusal('MALFORMED_SET_R_RANK_INPUT', { field: 'input' });
  }
  const scores = entries.map((entry, position) => bindScorePreparation(entry, position));
  const documents = entries.map((entry) => entry.document);

  assertSingleSlotAndSplit(documents);
  assertLowerHexDocumentSha256s(documents);
  assertUniqueDocumentSha256s(documents);

  const keyed = documents.map((document, position) => ({
    selectionIndex: document.selectionIndex,
    split: document.split,
    documentSha256: document.documentSha256,
    saltedRankSha256: prefixedDocumentRankHash(SET_R_TIE_BREAK_KEY_PREFIX, document.documentSha256),
    resolvedScoreDecimal: scores[position] as string,
  }));
  assertUniqueRankDigests(keyed);

  keyed.sort(
    (a, b) =>
      compareNumeric84Decimal(b.resolvedScoreDecimal, a.resolvedScoreDecimal) ||
      comparePlainLexicographic(a.saltedRankSha256, b.saltedRankSha256),
  );

  return Object.freeze(
    keyed.map((entry, rankPosition) =>
      Object.freeze({
        sample: 'SET_R' as const,
        selectionIndex: entry.selectionIndex,
        split: entry.split,
        documentSha256: entry.documentSha256,
        saltedRankSha256: entry.saltedRankSha256,
        rankPosition,
      }),
    ),
  );
}

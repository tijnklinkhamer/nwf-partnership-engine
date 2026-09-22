/**
 * PHASE 2B-2D — A3 R21: THE DOCUMENT-SOURCE ASSEMBLER'S FAIL-CLOSED REFUSAL.
 *
 * R21 turns durable source rows into exact documents. Every question the
 * frozen methodology does not answer - which extraction version represents a
 * document, which of two differing texts is "the" text - is a REFUSAL, never
 * a precedence rule. Choosing would be a representative selection, and R21 is
 * forbidden to make one.
 *
 * There is no partial result. A batch that refused half way would hand R22
 * documents for some DEV_TRAIN slots and silence for the rest.
 *
 * Refusal messages name a category, a field and array positions. They never
 * name an organisation, a selection index, a run, a row id, a URL, a document
 * digest, a score or extracted text.
 */

export const A3_DOCUMENT_SOURCE_REFUSAL_CODES = Object.freeze([
  // Input authority (Level B).
  'R20_DURABLE_EVIDENCE_NOT_MINTED_FOR_THIS_BATCH',
  'R21_DURABLE_EVIDENCE_ALREADY_ASSEMBLED',
  'R21_BATCH_COMPOSITION_INVALID',
  'R21_NOT_A_MINTED_SLOT_DOCUMENT_SOURCE_ASSEMBLY',
  'R21_NOT_AN_UNBOUND_SLOT_DOCUMENT_SOURCE_ASSEMBLY',

  // Slot shape.
  'R21_SPLIT_NOT_SUPPORTED',
  'R21_SLOT_INPUT_SHAPE_INVALID',
  'R21_SLOT_HAS_NO_PAGE_EVIDENCE',

  // Source-row relations.
  'R21_SOURCE_ROW_SHAPE_INVALID',
  'R21_DUPLICATE_PAGE_EVIDENCE_SOURCE_ROW',
  'R21_PAGE_FETCH_DOCUMENT_SHA_MISMATCH',
  'R21_CANDIDATE_OUTSIDE_SLOT_PAGE_EVIDENCE',
  'R21_CANDIDATE_DOCUMENT_SHA_MISMATCH',

  // The extraction support gate (§12).
  'R21_MULTI_EXTRACTION_VERSION_DOCUMENT_REQUIRES_EXPLICIT_POLICY',
  'R21_UNSUPPORTED_EXTRACTION_RULE_VERSION',

  // Text by equality (§13).
  'R21_EXACT_DOCUMENT_TEXT_DIVERGENCE',

  // Canonical R10.
  'R21_SET_R_SCORE_PREPARATION_REFUSED',

  // Text lookup.
  'R21_DOCUMENT_TEXT_LOOKUP_UNKNOWN_DOCUMENT',
] as const);

export type A3DocumentSourceRefusalCode = (typeof A3_DOCUMENT_SOURCE_REFUSAL_CODES)[number];

export class A3DocumentSourceRefusal extends Error {
  constructor(
    readonly code: A3DocumentSourceRefusalCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(`${code}: ${message}`, options);
    this.name = 'A3DocumentSourceRefusal';
  }
}

export function refuse(
  code: A3DocumentSourceRefusalCode,
  message: string,
  options?: { readonly cause?: unknown },
): never {
  throw new A3DocumentSourceRefusal(code, message, options);
}

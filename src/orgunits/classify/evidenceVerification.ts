/**
 * THE ANTI-HALLUCINATION CONTRACT — literal evidence-span and `unit_name`
 * verification (design §9).
 *
 * "The validator verifies each `quote` is a literal substring of the
 * supplied field it names (after the same whitespace normalisation applied
 * at assembly)." NO FUZZY MATCHING. NO SEMANTIC MATCHING. NO normalisation
 * that changes meaning — only whitespace collapsing, which does not. This
 * is deliberately STRICTER than `unit_name`'s own rule, which the design
 * explicitly widens: "`unit_name` is validated the same way (must appear,
 * MODULO WHITESPACE/DIACRITICS FOLDING, within a supplied field) or be
 * null." Phase 2B-2D2B-1 added CASE to that fold list, and only case; see
 * `unitNameVerifies`. Two different rules, on purpose — an evidence span is a claim
 * "the document said exactly this", while `unit_name` is a claim "this is
 * the name stated in the document", which may legitimately be transcribed
 * with a different accent mark or spacing than the raw extracted bytes.
 *
 * SOURCE-TO-FIELD MAPPING (design §7's closed source enum against the
 * actual `ClassifierDocument` shape a call sends — `types.ts`):
 *
 *   TITLE     -> document.title
 *   HEADING   -> any one of document.headings[].text
 *   EXCERPT   -> document.excerpt
 *   URL_PATH  -> document.url
 *
 * `URL_PATH` maps to the document's full `url` field, not a separate
 * "url path" property, because `ClassifierDocument` HAS no such separate
 * field (`types.ts`) — the model receives no `urlPath`-shaped value
 * distinct from the URL it was already given, unlike the deterministic
 * signal layer's own internal `urlPath` field (`signals/score.ts`), which
 * this document construct never exposes to the model at all.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import type { ClassifierDocument } from './types.js';
import type { EvidenceSource } from './outputSchema.js';

/** Collapses runs of whitespace to one space and trims — meaning-preserving, unlike case or diacritic folding. */
function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Combining Diacritical Marks block (U+0300-U+036F) — what NFD decomposition strips a base letter's accents into. */
const COMBINING_MARKS_PATTERN = /[̀-ͯ]/g;

/** NFD-decomposes and strips combining marks — folds accents without altering letter identity or case. */
function foldDiacritics(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS_PATTERN, '');
}

/**
 * THE `unit_name` FOLD, and the complete list of what it folds: whitespace,
 * then diacritics, then CASE. Nothing else.
 *
 * `toLowerCase`, never `toLocaleLowerCase`: a locale-sensitive fold would
 * make verification depend on the machine's locale, so the same evidence and
 * the same returned name could verify on one host and fail on another.
 */
function foldUnitName(text: string): string {
  return foldDiacritics(normaliseWhitespace(text)).toLowerCase();
}

function fieldsForSource(document: ClassifierDocument, source: EvidenceSource): readonly string[] {
  switch (source) {
    case 'TITLE':
      return document.title === null ? [] : [document.title];
    case 'HEADING':
      return document.headings.map((h) => h.text);
    case 'EXCERPT':
      return [document.excerpt];
    case 'URL_PATH':
      return [document.url];
  }
}

/** True iff `quote`, after whitespace normalisation, is a literal substring of at least one candidate field, itself whitespace-normalised. */
export function evidenceSpanVerifies(
  document: ClassifierDocument,
  source: EvidenceSource,
  quote: string,
): boolean {
  const candidates = fieldsForSource(document, source);
  const needle = normaliseWhitespace(quote);
  if (needle === '') return false;
  return candidates.some((field) => normaliseWhitespace(field).includes(needle));
}

/**
 * True iff `name`, after whitespace normalisation, diacritic folding AND
 * case folding, is a literal substring of at least one of the document's
 * title, excerpt, or any heading text — the free-text fields a stated unit
 * name could plausibly appear in. `url` is deliberately excluded: a unit's
 * stated name belongs in prose, not in a URL path.
 *
 * CASE FOLDING WAS ADDED IN PHASE 2B-2D2B-1, and it is exactly one
 * additional DETERMINISTIC fold — not a loosening of the contract into
 * fuzziness. The measured failure: a document heading reads
 * `centre de documentation` and the model returns the same name
 * conventionally capitalised as `Centre de documentation`. That is the SAME
 * name, transcribed the way a name is written, which is precisely what this
 * rule already tolerates for accents and spacing. Case carries no semantic
 * distinction in an institutional unit name, so refusing on it rejected
 * honest answers while catching no hallucination.
 *
 * WHAT WAS NOT ADDED, and must not be: punctuation folding, acronym
 * expansion, token reordering, fuzzy/edit-distance matching, and above all
 * CROSS-DOCUMENT LOOKUP. A name assembled from a SIBLING document is a
 * fabrication with respect to the document it is claimed about, and it must
 * keep failing — case-insensitively too, which it does, because the
 * candidate fields are this document's own and case folding does not reach
 * across documents.
 */
export function unitNameVerifies(document: ClassifierDocument, name: string): boolean {
  const candidateFields: readonly string[] = [
    ...(document.title === null ? [] : [document.title]),
    document.excerpt,
    ...document.headings.map((h) => h.text),
  ];
  const needle = foldUnitName(name);
  if (needle === '') return false;
  return candidateFields.some((field) => foldUnitName(field).includes(needle));
}

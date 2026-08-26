/**
 * DETERMINISTIC TERM NORMALISATION AND TOKEN-BOUNDARY MATCHING.
 *
 * WHY TOKEN BOUNDARIES, NEVER SUBSTRINGS
 *
 *   `langues` must never match inside `languedoc`. A substring test cannot
 *   tell the two apart; a TOKEN test can, because normalisation turns
 *   `languedoc` into the single token `languedoc` and `langues` into the
 *   single token `langues`, and those are never equal. Every phrase in this
 *   layer is matched as a CONTIGUOUS SEQUENCE of whole tokens
 *   (`containsPhrase`), never as `text.includes(phrase)`.
 *
 * WHY HYPHENS ARE TREATED AS WORD BOUNDARIES
 *
 *   `relations-internationales` (a URL path segment) and
 *   `relations internationales` (ordinary prose) must be recognised as the
 *   SAME two-token phrase. Hyphens and underscores are therefore folded to
 *   spaces before tokenising, exactly like any other separator.
 *
 * WHY DIACRITICS ARE STRIPPED FOR COMPARISON ONLY
 *
 *   `LANGUES`, `langues` and an accent-bearing variant must all normalise to
 *   the same comparison token. This module normalises for MATCHING PURPOSES
 *   ONLY - it never mutates a caller's original text. `extractPage` and
 *   friends keep the exact bytes they were given; only the copy handed to
 *   this module's functions is folded.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/** Strips diacritics (accents) from text, leaving the base letters. */
export function stripDiacritics(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').normalize('NFC');
}

/**
 * Folds text to a comparable form: diacritics stripped, lower-cased, hyphens
 * and underscores treated as word separators, every other non-letter/digit
 * run collapsed to a single space, and outer whitespace trimmed.
 *
 * IDEMPOTENT: normalising an already-normalised string returns it unchanged.
 */
export function normaliseForMatching(text: string): string {
  return stripDiacritics(text)
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits already-normalised-or-not text into comparison tokens. */
export function tokenise(text: string): string[] {
  const normalised = normaliseForMatching(text);
  return normalised === '' ? [] : normalised.split(' ');
}

/**
 * True when `phraseTokens` occurs in `fieldTokens` as a CONTIGUOUS run, in
 * order. An empty phrase never matches anything; a phrase longer than the
 * field can never match.
 */
export function containsPhrase(
  fieldTokens: readonly string[],
  phraseTokens: readonly string[],
): boolean {
  if (phraseTokens.length === 0 || phraseTokens.length > fieldTokens.length) return false;
  const lastStart = fieldTokens.length - phraseTokens.length;
  outer: for (let start = 0; start <= lastStart; start += 1) {
    for (let offset = 0; offset < phraseTokens.length; offset += 1) {
      if (fieldTokens[start + offset] !== phraseTokens[offset]) continue outer;
    }
    return true;
  }
  return false;
}

/** True when any text in `texts` contains `phraseTokens` as a contiguous token run. */
export function anyTextContainsPhrase(
  texts: readonly string[],
  phraseTokens: readonly string[],
): boolean {
  return texts.some((text) => containsPhrase(tokenise(text), phraseTokens));
}

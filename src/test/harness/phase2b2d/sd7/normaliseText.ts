/**
 * NORMALISATION FOR SD7, AND NOTHING MORE THAN THE FROZEN WORDING REQUIRES.
 *
 * R3's SD7 says: "shingle the redacted extracted main_text into overlapping
 * token 5-grams AFTER WHITESPACE AND CASE NORMALISATION". Those are the only
 * two transformations named, and this module performs exactly those two.
 *
 * WHAT IS DELIBERATELY NOT DONE, AND WHY EACH ABSENCE MATTERS
 *
 *   NO STEMMING.               R3 forbids it by name.
 *   NO PUNCTUATION STRIPPING.  R3 forbids it by name. Punctuation stays INSIDE
 *                              the token: `l'université` is one token, and
 *                              `office.` differs from `office`. Stripping would
 *                              raise similarity across the board and silently
 *                              move the 0.90 threshold's meaning.
 *   NO LANGUAGE-SPECIFIC TOKENIZER. R3 forbids it by name. Whitespace is the
 *                              only word boundary this repository is entitled
 *                              to assume, and the corpus is multilingual.
 *   NO UNICODE CANONICAL NORMALISATION. Not `NFC`, not `NFD`, not `NFKC`. The
 *                              owner's instruction is explicit: no canonical
 *                              normalisation "beyond what JavaScript string
 *                              handling already represents". A page composing
 *                              `é` as U+00E9 and another composing it as
 *                              `e` + U+0301 therefore tokenise differently, and
 *                              that is the specified behaviour, not a defect.
 *   NO ACCENT REMOVAL.         Explicitly forbidden. It is also the same class
 *                              of error as punctuation stripping.
 *   NO EMBEDDING, NO MODEL.    SD7 is a lexical rule end to end.
 *
 * THIS MODULE IS PURE and it NEVER RETURNS TEXT TO A CALLER THAT PRINTS. The
 * page bytes flow from here into shingle hashing and into nothing else.
 */
import { NEAR_DUPLICATE_SHINGLE_SIZE } from './sd7Contract.js';

/**
 * LOCALE-INDEPENDENT lower-casing.
 *
 * `toLowerCase` applies the Unicode Default Case Conversion and is defined
 * without reference to a locale. `toLocaleLowerCase` is NOT used and must never
 * be: under a Turkish locale it maps `I` to `ı` rather than `i`, which would
 * make this repository's measurement depend on the host's language settings.
 * Two runs of the same pilot on two machines have to agree.
 */
export function lowerCaseLocaleIndependently(text: string): string {
  return text.toLowerCase();
}

/**
 * The frozen normalisation, in the exact order the owner specified:
 * lower-case, then trim, then collapse Unicode whitespace runs to one space.
 *
 * `\s` in a JavaScript regular expression already covers the Unicode whitespace
 * this needs - the ASCII controls, U+0020, U+00A0 NO-BREAK SPACE, U+1680,
 * U+2000..U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. A
 * non-breaking space is ordinary in institutional HTML, and treating it as a
 * word character would fuse two words into one token on some pages and not
 * others.
 */
export function normaliseForShingling(text: string): string {
  return lowerCaseLocaleIndependently(text).trim().replace(/\s+/gu, ' ');
}

/**
 * Whitespace-delimited tokens of the normalised text.
 *
 * Empty input yields ZERO tokens rather than one empty token - `''.split(' ')`
 * returns `['']`, which would report a blank page as having one token and would
 * make an empty page look one token closer to being measurable than it is.
 */
export function tokenise(text: string): readonly string[] {
  const normalised = normaliseForShingling(text);
  if (normalised === '') return [];
  return normalised.split(' ');
}

/**
 * Whether a page carries enough tokens to produce even one shingle.
 *
 * A page that does not is NOT given a similarity of 0, or 1, or anything else:
 * it is `SD7_SHORT_TEXT_UNRESOLVED`. See `sd7Contract.ts` for why that is a
 * fail-closed rule rather than a default.
 */
export function hasEnoughTokensToShingle(tokens: readonly string[]): boolean {
  return tokens.length >= NEAR_DUPLICATE_SHINGLE_SIZE;
}

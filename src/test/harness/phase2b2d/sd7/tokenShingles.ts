/**
 * OVERLAPPING TOKEN 5-GRAMS, COLLISION-SAFELY ENCODED.
 *
 * R3 fixes `NEAR_DUPLICATE_SHINGLE_SIZE = 5` and calls for OVERLAPPING token
 * n-grams. Overlapping means every consecutive window, stepping by ONE token -
 * `n` tokens yield `n - 4` shingles, not `n / 5`. Stepping by five would make
 * similarity depend on where a page happens to start relative to the window
 * grid, so two pages differing by one leading word could share nothing.
 *
 * WHY THE ENCODING IS JSON AND NOT A JOIN
 *
 *   A shingle has to be a SET member, so it has to be a single comparable
 *   value. Joining the five tokens with a space is the obvious move and it is
 *   wrong: `['a b', 'c', 'd', 'e', 'f']` and `['a', 'b', 'c', 'd', 'e', 'f']`
 *   would both render `a b c d e f`, so two different token sequences would
 *   collide into one shingle. No separator character fixes this, because
 *   punctuation is preserved inside tokens and any separator could therefore
 *   occur inside one.
 *
 *   `JSON.stringify` of the five-token array is unambiguous: the encoding is
 *   injective because JSON string escaping is, so distinct token sequences
 *   always produce distinct shingles. Tokens never contain a raw newline
 *   (whitespace was collapsed before tokenisation), so the encoding stays
 *   single-line, but correctness does not depend on that.
 *
 * THIS MODULE IS PURE.
 */
import { NEAR_DUPLICATE_SHINGLE_SIZE } from './sd7Contract.js';

/**
 * The canonical single-value encoding of one ordered n-gram.
 *
 * Exported so the tests can assert the encoding directly rather than inferring
 * it from a similarity that happened to come out right.
 */
export function encodeShingle(tokens: readonly string[]): string {
  return JSON.stringify(tokens);
}

/**
 * Every consecutive window of exactly `size` tokens, in order, stepping by one.
 *
 * Fewer than `size` tokens yields an EMPTY list - never a padded window and
 * never a short window. A padded window would invent tokens the page does not
 * contain; a short window would compare 5-grams against 3-grams.
 */
export function tokenShingles(
  tokens: readonly string[],
  size: number = NEAR_DUPLICATE_SHINGLE_SIZE,
): readonly string[] {
  if (size < 1) throw new RangeError(`shingle size must be >= 1, got ${size}`);
  if (tokens.length < size) return [];
  const shingles: string[] = [];
  for (let start = 0; start + size <= tokens.length; start += 1) {
    shingles.push(encodeShingle(tokens.slice(start, start + size)));
  }
  return shingles;
}

/**
 * The SET of shingles, which is what Jaccard is defined over.
 *
 * A page that repeats a phrase contributes that shingle ONCE. R3 says Jaccard,
 * and Jaccard is a set measure; counting multiplicity would be a different
 * statistic wearing the same name.
 */
export function shingleSet(
  tokens: readonly string[],
  size: number = NEAR_DUPLICATE_SHINGLE_SIZE,
): ReadonlySet<string> {
  return new Set(tokenShingles(tokens, size));
}

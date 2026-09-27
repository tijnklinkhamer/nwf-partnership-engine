/**
 * SD9'S OWN PREREQUISITE, MADE STRUCTURAL: A PAGE WITH NO EXTRACTED TEXT IS NOT
 * A "PAGE WITH EXTRACTABLE TEXT", SO IT NEVER ENTERS SD7 DEDUPLICATION.
 *
 * THIS MODULE IS PURE. No socket, no database, no filesystem, no clock, no
 * randomness, no environment read.
 *
 * THE FROZEN WORDING
 *
 *   R3 rule SD9: "An organisation is ACQUISITION_SUCCESSFUL iff, after
 *   policy-authorised discovery and after SD7 deduplication, it yields at least
 *   MIN_PAGES_PER_ORGANISATION = 4 distinct pages WITH EXTRACTABLE TEXT."
 *
 *   The last three words are a prerequisite, not decoration. A persisted page
 *   whose extraction is zero characters long has no extractable text on the
 *   only measurement this repository holds, so it was never in SD9's
 *   denominator - and a deduplication pass that receives it is measuring a
 *   population SD9 does not count.
 *
 * WHAT WENT WRONG WITHOUT THIS GATE
 *
 *   A zero-character `main_text` produces NO token 5-grams, so the near-
 *   duplicate pass could not compare it and recorded it
 *   SD7_SHORT_TEXT_UNRESOLVED - which lets it contribute 0..1 to the post-SD7
 *   survivor count. The upper end of that contribution asserts the page MIGHT
 *   be a page with extractable text. It cannot be. One acquisition-of-record
 *   run with 31 zero-character pages was consequently reported as post-SD7
 *   [0, 31] - a range straddling the threshold of 4 - and held PENDING, when
 *   the truthful count under SD9's own wording is exactly 0.
 *
 * WHAT THIS IS NOT
 *
 *   It is NOT the short-text rule and it does not touch it. A page that
 *   extracted ONE character still extracts text; it simply cannot be shingled,
 *   and it remains SD7_SHORT_TEXT_UNRESOLVED under
 *   SD7_SHORT_TEXT_UNRESOLVED_HANDLING_V1 exactly as before. There is no
 *   token minimum, no word minimum, no language, heading, title or quality
 *   requirement here. The predicate is `mainTextChars > 0` and nothing else.
 *
 * WHY THE ELIGIBLE TYPE IS BRANDED
 *
 *   A rule enforced by a caller remembering to filter is a rule that holds
 *   until the next caller. `Sd9EligiblePage` carries a private brand that only
 *   `partitionByExtractableText` can attach, and the deduplication passes
 *   accept nothing else - so a raw page-evidence row cannot reach exact or
 *   near-duplicate deduplication by any route, including a new one. This is
 *   the same unforgeable-brand technique Phase 2B-1b used to stop a caller
 *   manufacturing a site-policy capability it had not derived.
 */
import { Sd7PilotStop } from './sd7Contract.js';

/**
 * ONE PERSISTED `orgunit_page_evidence` ROW, joined to its fetch's document
 * hash, exactly as the database holds it - INCLUDING a zero-character one.
 *
 * This is the ONLY type in the SD7 bridge carrying page text, and it is an
 * INPUT. Nothing that is serialised has anywhere to put one.
 */
export interface PageForSd7 {
  readonly pageId: string;
  /**
   * `orgunit_fetch_observations.response_sha256` - the SHA-256 of the DECODED
   * response bytes, and the only document hash the landed schema has.
   */
  readonly documentSha256: string;
  readonly mainText: string;
  /** `orgunit_page_evidence.main_text_chars`, as persisted. */
  readonly mainTextChars: number;
}

declare const SD9_ELIGIBLE: unique symbol;

/**
 * A page that satisfies SD9's "with extractable text" prerequisite.
 *
 * The brand is `declare`d and never assigned at runtime, so it costs nothing
 * and cannot be forged by an object literal, a spread, a clone or a cast that
 * TypeScript will accept quietly.
 */
export interface Sd9EligiblePage extends PageForSd7 {
  readonly [SD9_ELIGIBLE]: true;
}

export interface ExtractableTextPartition {
  /** EVERY persisted page-evidence row, including zero-character ones. */
  readonly rawPageEvidenceCount: number;
  /** The subset with `mainTextChars > 0`. This is SD9's population. */
  readonly sd9ExtractableTextPageCount: number;
  /** `rawPageEvidenceCount - sd9ExtractableTextPageCount`. Preserved, never erased. */
  readonly zeroExtractedTextPageCount: number;
  /** The eligible rows, input order preserved. The ONLY input to deduplication. */
  readonly eligible: readonly Sd9EligiblePage[];
}

/**
 * Split persisted page-evidence rows into the SD9-eligible set and the
 * zero-extracted-text remainder, and FAIL CLOSED on any row that violates the
 * landed schema's own invariant.
 *
 * The consistency checks are here rather than at the database boundary on
 * purpose: this is the one place every page row must pass through before it can
 * influence an SD9 verdict, so it is the one place where "the evidence is not
 * the shape the schema promises" is guaranteed to be noticed. A violation is a
 * STOP. Nothing is repaired, and no database row is touched.
 */
export function partitionByExtractableText(rows: readonly PageForSd7[]): ExtractableTextPartition {
  const eligible: Sd9EligiblePage[] = [];

  for (const row of rows) {
    if (!Number.isInteger(row.mainTextChars) || row.mainTextChars < 0) {
      throw new Sd7PilotStop(
        'STOP: a page-evidence row carries a mainTextChars that is not a ' +
          'non-negative integer. The landed schema does not permit that, so the ' +
          'evidence in front of the bridge is not the evidence the schema describes.',
      );
    }
    if (row.mainTextChars === 0 && row.mainText !== '') {
      throw new Sd7PilotStop(
        'STOP: a page-evidence row reports zero extracted characters but carries ' +
          'non-empty text. The two disagree, and choosing which one is the ' +
          'evidence would be a repair, not a measurement.',
      );
    }
    if (row.mainTextChars > 0 && row.mainText === '') {
      throw new Sd7PilotStop(
        'STOP: a page-evidence row reports extracted characters but carries empty ' +
          'text. The two disagree, and choosing which one is the evidence would be ' +
          'a repair, not a measurement.',
      );
    }
    // SD9's prerequisite, and the whole of it.
    if (row.mainTextChars > 0) eligible.push(row as Sd9EligiblePage);
  }

  return {
    rawPageEvidenceCount: rows.length,
    sd9ExtractableTextPageCount: eligible.length,
    zeroExtractedTextPageCount: rows.length - eligible.length,
    eligible,
  };
}

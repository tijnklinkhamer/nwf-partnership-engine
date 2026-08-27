/**
 * PAGE EVIDENCE: turning ONE eligible, successfully-fetched HTML response
 * into ONE `orgunit_page_evidence` row.
 *
 * THE GRAINS STAY SEPARATE
 *
 *   A fetch observation says "the HTTP attempt happened" - it exists for
 *   every attempt, 2xx through 5xx, robots-blocked or not. Page evidence says
 *   "we successfully derived safe textual evidence from what came back", and
 *   it does NOT exist for every fetch: a non-HTML response, an unresolvable
 *   charset, or a fetch that never returned a body at all (an error, a
 *   robots refusal) all leave a fetch observation and produce NO page
 *   evidence row. `persistPageEvidence` never mutates the fetch observation
 *   to hide that distinction - it only INSERTs, or does not.
 *
 * APPEND-ONLY, LIKE EVERYTHING ELSE IN THIS NAMESPACE
 *
 *   One statement, one INSERT, `ON CONFLICT DO NOTHING` against the landed
 *   `(fetch_observation_id, rule_version)` unique index. Re-processing the
 *   same fetch under the same rule version is therefore a safe no-op, never a
 *   silent second row and never an UPDATE.
 *
 * PURE ORCHESTRATION over the pure `charset.ts`/`extract.ts` modules and one
 * INSERT. Opens no socket.
 */
import type pg from 'pg';
import { resolveCharset } from './charset.js';
import { extractPage, truncateToCodePointLimit, unicodeCodePointLength } from './extract.js';
import type { WebAttemptResult } from './gateway.js';

/** Versioned so a future extraction-rule change appends new evidence rather than rewriting old evidence. */
export const EXTRACTION_RULE_VERSION = 'orgunit-extraction-v1';

/** The hard schema cap. Never increase this without a new migration. */
export const MAIN_TEXT_CAP = 40_000;

/**
 * Content types this extractor will read as HTML.
 *
 * Deliberately narrow: a fetch observation is not automatically page
 * evidence, and a URL that merely LOOKS like a web page (by its path) is not
 * a reason to parse a PDF, an image or a JSON body as if it were markup.
 */
function isHtmlEligible(contentType: string | null): boolean {
  if (contentType === null) return false;
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'text/html' || mediaType === 'application/xhtml+xml';
}

export type PageEvidenceOutcome =
  | { outcome: 'PERSISTED'; id: string }
  | { outcome: 'ALREADY_PERSISTED' }
  | { outcome: 'NOT_ELIGIBLE'; reason: NotEligibleReason };

export type NotEligibleReason =
  | 'NO_FETCH_OBSERVATION_ID'
  | 'NO_BODY'
  | 'NOT_SUCCESSFUL_STATUS'
  | 'NOT_HTML'
  | 'CHARSET_UNRESOLVED';

/**
 * Derives and persists page evidence for one fetch result, or reports honestly
 * why it could not.
 *
 * Takes the IN-MEMORY `WebAttemptResult` directly (never re-reads the body
 * from anywhere else, because nowhere else has it - the gateway keeps no
 * durable copy). Once this function returns, the caller may safely drop
 * `fetchResult.body`; nothing here retains a reference to it.
 */
export async function persistPageEvidence(
  pool: pg.Pool,
  fetchResult: WebAttemptResult,
): Promise<PageEvidenceOutcome> {
  if (fetchResult.observationId === null) {
    return { outcome: 'NOT_ELIGIBLE', reason: 'NO_FETCH_OBSERVATION_ID' };
  }
  if (fetchResult.body === null) {
    return { outcome: 'NOT_ELIGIBLE', reason: 'NO_BODY' };
  }
  // Only a SUCCESSFUL response is the page. A 3xx body is a redirect notice,
  // not the target's content, and a 4xx/5xx body is an error page, however
  // well-formatted as HTML either might be - extracting either would record
  // "evidence" about a page that was never actually served.
  if (
    fetchResult.httpStatus === null ||
    fetchResult.httpStatus < 200 ||
    fetchResult.httpStatus >= 300
  ) {
    return { outcome: 'NOT_ELIGIBLE', reason: 'NOT_SUCCESSFUL_STATUS' };
  }
  if (!isHtmlEligible(fetchResult.contentType)) {
    return { outcome: 'NOT_ELIGIBLE', reason: 'NOT_HTML' };
  }

  const charsetResult = resolveCharset(fetchResult.body, fetchResult.contentType);
  if (charsetResult.outcome === 'UNRESOLVED') {
    return { outcome: 'NOT_ELIGIBLE', reason: 'CHARSET_UNRESOLVED' };
  }

  const extracted = extractPage(charsetResult.text);
  const { text: mainText, truncated } = capMainText(extracted.mainText);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orgunit_page_evidence
        (fetch_observation_id, root_key, title, declared_lang, headings,
         main_text, main_text_chars, main_text_truncated, extraction_method,
         rule_version, observed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (fetch_observation_id, rule_version) DO NOTHING
     RETURNING id`,
    [
      fetchResult.observationId,
      fetchResult.rootKey,
      extracted.title,
      extracted.declaredLang,
      JSON.stringify(extracted.headings),
      mainText,
      unicodeCodePointLength(mainText),
      truncated,
      extracted.extractionMethod,
      EXTRACTION_RULE_VERSION,
      new Date(),
    ],
  );

  const id = rows[0]?.id;
  return id === undefined ? { outcome: 'ALREADY_PERSISTED' } : { outcome: 'PERSISTED', id };
}

/**
 * Truncates deterministically to the schema's hard cap, in Unicode CODE
 * POINTS - matching PostgreSQL's `length(main_text)`, which the schema's own
 * `main_text_chars = length(main_text)` CHECK is written against, and never
 * JavaScript's UTF-16-code-unit `.length` (see `truncateToCodePointLimit`).
 *
 * A body of EXACTLY the cap is not truncated - the same "over-cap is a
 * truncation, an at-cap body is complete" rule the gateway's byte cap already
 * applies (ADR 0005 s6), restated here for characters rather than bytes.
 */
function capMainText(text: string): { text: string; truncated: boolean } {
  return truncateToCodePointLimit(text, MAIN_TEXT_CAP);
}

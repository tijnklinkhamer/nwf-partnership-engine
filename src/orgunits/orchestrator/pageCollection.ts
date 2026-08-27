/**
 * BOUNDED IN-MEMORY PAGE COLLECTION, then ONE APPEND-ONLY PERSIST PER PAGE -
 * the first legitimate site on which the landed cross-page
 * boilerplate-differencing primitive (`computeChromeLines`/
 * `removeChromeLines`, extract.ts, 2B-1c) can actually run.
 *
 * WHY THIS DIFFERS FROM `pageEvidence.ts`'s `persistPageEvidence`
 *
 *   `persistPageEvidence` derives AND inserts in one step, from a single
 *   fetch result, because through 2B-1c only one page was ever fetched at a
 *   time - one page cannot supply a valid site-level boilerplate profile
 *   (extract.ts's own module comment). This orchestrator fetches SEVERAL
 *   pages per root, which is the first point a genuine multi-page sample
 *   exists. So THIS module derives (charset + extraction, exactly as
 *   `persistPageEvidence` does) and holds the result in BOUNDED memory -
 *   never re-reading a response body from anywhere else, because nowhere
 *   else has it - until the whole root's page set is known, computes the
 *   site-level chrome, and THEN persists each page exactly ONCE. No page
 *   evidence row is ever inserted and later updated: the row that reaches
 *   the database already reflects differencing where it applied.
 *
 * GROUPING GRAIN: by HOST. `www.example.edu` and `international.example.edu`
 * are different sites for boilerplate purposes - a shared institutional CSS
 * framework does not imply shared navigation chrome across subdomains, and
 * the measured composition finding (ADR 0004 s3) was per-site.
 *
 * THE MINIMUM SAMPLE GUARD (`MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING`,
 * constants.ts): a host with fewer pages than this NEVER has differencing
 * applied - `extractionMethod` stays exactly what `extractPage` produced
 * (`MAIN_ELEMENT` or `FULL_BODY`). This is what stops "100% of a 1-page or
 * 2-page sample" from ever being read as chrome.
 *
 * Opens no socket. `deriveEligiblePage` is pure over an in-memory
 * `WebAttemptResult`; `persistCollectedPages` performs plain SQL INSERTs.
 */
import type pg from 'pg';
import { resolveCharset } from '../web/charset.js';
import {
  computeChromeLines,
  extractPage,
  removeChromeLines,
  truncateToCodePointLimit,
  unicodeCodePointLength,
  type Heading,
} from '../web/extract.js';
import type { WebAttemptResult } from '../web/gateway.js';
import { MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING } from './constants.js';

/** Versioned exactly as `pageEvidence.ts` - this module produces the SAME evidence grain, just batched. */
export const EXTRACTION_RULE_VERSION = 'orgunit-extraction-v1';
export const MAIN_TEXT_CAP = 40_000;

export type NotEligibleReason =
  | 'NO_FETCH_OBSERVATION_ID'
  | 'NO_BODY'
  | 'NOT_SUCCESSFUL_STATUS'
  | 'NOT_HTML'
  | 'CHARSET_UNRESOLVED';

export interface CollectedPage {
  readonly fetchObservationId: string;
  readonly rootKey: string;
  readonly requestedUrl: string;
  readonly requestedHost: string;
  readonly title: string | null;
  readonly declaredLang: string | null;
  readonly headings: Heading[];
  /** Extracted, PII-redacted text lines, pre-differencing (extract.ts's own mainText, split on '\n'). */
  readonly mainTextLines: string[];
  readonly preDifferencingMethod: 'MAIN_ELEMENT' | 'FULL_BODY';
  readonly observedAt: Date;
}

export type DeriveOutcome =
  | { outcome: 'ELIGIBLE'; page: CollectedPage; decodedHtml: string }
  | { outcome: 'NOT_ELIGIBLE'; reason: NotEligibleReason };

function isHtmlEligible(contentType: string | null): boolean {
  if (contentType === null) return false;
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return mediaType === 'text/html' || mediaType === 'application/xhtml+xml';
}

/**
 * Derives (never persists) ONE page's extracted evidence from its in-memory
 * fetch result - the same eligibility gate `persistPageEvidence` applies: a
 * genuine 2xx HTML response with a resolvable charset, never a redirect or
 * an error page however HTML-shaped its body.
 */
export function deriveEligiblePage(
  fetchResult: WebAttemptResult,
  rootKey: string,
  requestedHost: string,
): DeriveOutcome {
  if (fetchResult.observationId === null) {
    return { outcome: 'NOT_ELIGIBLE', reason: 'NO_FETCH_OBSERVATION_ID' };
  }
  if (fetchResult.body === null) {
    return { outcome: 'NOT_ELIGIBLE', reason: 'NO_BODY' };
  }
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
  return {
    outcome: 'ELIGIBLE',
    decodedHtml: charsetResult.text,
    page: {
      fetchObservationId: fetchResult.observationId,
      rootKey,
      requestedUrl: fetchResult.requestedUrl,
      requestedHost,
      title: extracted.title,
      declaredLang: extracted.declaredLang,
      headings: extracted.headings,
      mainTextLines: extracted.mainText.split('\n'),
      preDifferencingMethod:
        extracted.extractionMethod === 'MAIN_ELEMENT' ? 'MAIN_ELEMENT' : 'FULL_BODY',
      observedAt: new Date(),
    },
  };
}

/**
 * Truncates to the schema's hard cap in Unicode CODE POINTS - matching
 * PostgreSQL's `length(main_text)`, never JavaScript's UTF-16-code-unit
 * `.length` (see `truncateToCodePointLimit` in `extract.ts` for why the two
 * disagree on any astral character, and the shadow-validation defect this
 * closes).
 */
function capMainText(text: string): { text: string; truncated: boolean } {
  return truncateToCodePointLimit(text, MAIN_TEXT_CAP);
}

export interface PersistedPage {
  readonly id: string;
  readonly rootKey: string;
  readonly url: string;
  readonly title: string | null;
  readonly headings: Heading[];
}

/** One page's evidence INSERT did not persist - the page's own URL and the real thrown message, never swallowed. */
export interface PageEvidencePersistenceFailure {
  readonly url: string;
  readonly message: string;
}

export interface PersistCollectedPagesResult {
  /** Every page that persisted successfully - unaffected by a SIBLING page's failure. */
  readonly pages: PersistedPage[];
  /** Empty when every collected page persisted. Non-empty is an honest, reportable partial failure - never silently dropped. */
  readonly failures: readonly PageEvidencePersistenceFailure[];
}

/**
 * Groups the collected pages BY HOST, applies cross-page boilerplate
 * differencing to each group with at least `MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING`
 * pages, and inserts ONE `orgunit_page_evidence` row per page - append-only,
 * `ON CONFLICT (fetch_observation_id, rule_version) DO NOTHING`, exactly as
 * `pageEvidence.ts` does for the single-page case.
 *
 * EVERY PAGE IS ATTEMPTED, regardless of an earlier page's outcome - this
 * function never aborts partway through a root's page set. A single page's
 * INSERT failing (a genuine, unexpected error; a CHECK violation is no longer
 * reachable for legitimate extracted text - see `capMainText`) must not cost
 * every OTHER already-fetched page its evidence, which is exactly the
 * partial-state the shadow validation found (ISAE/IPAG/Paris Cité/IFPEK: real
 * network budget spent, real pages read, then the whole root's evidence
 * batch lost to one bad row). Each failure is collected rather than thrown
 * immediately, so the caller decides how to surface it - see
 * `rootRunner.ts`, which persists candidates for every page that DID succeed
 * and only then raises an aggregate failure, so the run still ends up
 * honestly FAILED rather than silently COMPLETED.
 */
export async function persistCollectedPages(
  pool: pg.Pool,
  pages: readonly CollectedPage[],
): Promise<PersistCollectedPagesResult> {
  const byHost = new Map<string, CollectedPage[]>();
  for (const page of pages) {
    const list = byHost.get(page.requestedHost) ?? [];
    list.push(page);
    byHost.set(page.requestedHost, list);
  }

  const results: PersistedPage[] = [];
  const failures: PageEvidencePersistenceFailure[] = [];

  for (const [, hostPages] of byHost) {
    const applyDifferencing = hostPages.length >= MIN_PAGES_FOR_BOILERPLATE_DIFFERENCING;
    const chrome = applyDifferencing
      ? computeChromeLines(hostPages.map((page) => page.mainTextLines))
      : new Set<string>();

    for (const page of hostPages) {
      const finalLines = applyDifferencing
        ? removeChromeLines(page.mainTextLines.join('\n'), chrome)
            .split('\n')
            .filter((l) => l !== '')
        : page.mainTextLines;
      const finalText = finalLines.join('\n');
      const { text: mainText, truncated } = capMainText(finalText);

      const extractionMethod = applyDifferencing
        ? page.preDifferencingMethod === 'MAIN_ELEMENT'
          ? 'MAIN_ELEMENT_AND_DIFFERENCED'
          : 'BOILERPLATE_DIFFERENCED'
        : page.preDifferencingMethod;

      try {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO orgunit_page_evidence
              (fetch_observation_id, root_key, title, declared_lang, headings,
               main_text, main_text_chars, main_text_truncated, extraction_method,
               rule_version, observed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (fetch_observation_id, rule_version) DO NOTHING
           RETURNING id`,
          [
            page.fetchObservationId,
            page.rootKey,
            page.title,
            page.declaredLang,
            JSON.stringify(page.headings),
            mainText,
            unicodeCodePointLength(mainText),
            truncated,
            extractionMethod,
            EXTRACTION_RULE_VERSION,
            page.observedAt,
          ],
        );
        const id = rows[0]?.id;
        if (id !== undefined) {
          results.push({
            id,
            rootKey: page.rootKey,
            url: page.requestedUrl,
            title: page.title,
            headings: page.headings,
          });
        }
      } catch (error) {
        failures.push({
          url: page.requestedUrl,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { pages: results, failures };
}

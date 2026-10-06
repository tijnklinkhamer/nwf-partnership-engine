/**
 * PHASE 2B-2D — A3 R50: COMPLETE EXACT-DOCUMENT SOURCE PROVENANCE.
 *
 * One exact document is ONE review item with possibly SEVERAL source
 * presentations. For every id in the document's frozen
 * `sourcePageEvidenceIds`, in that exact stored order:
 *
 *   - exactly one source row of the SAME slot's genuine durable evidence has
 *     that page id (missing -> refuse; a page id stored twice -> refuse);
 *   - that row's response digest IS the document digest;
 *   - no other source row of the slot carries the document digest (an extra
 *     row would mean the document's provenance is incomplete);
 *   - every presentation's stored main text is byte-identical, so the item
 *     carries ONE equality-justified main text - not a chosen representative.
 *
 * No representative, no winner, no canonical index: every presentation is
 * kept, in provenance order.
 *
 * PURE. Text passes through unchanged; nothing here judges it.
 */
import { refuseR50 } from './refusal.js';
import type {
  HandoffSlotDocument,
  HandoffSourcePageRow,
  ReviewHeading,
  ReviewSourcePresentation,
} from './types.js';

/**
 * The one deterministic display form of stored headings.
 *
 * Durable evidence stores `headings` as `readonly unknown[]`. The landed
 * extractor writes `{ level, text }` objects; a bare string is accepted as
 * `{ level: null, text }`. Any other shape refuses - nothing is coerced into
 * trusted prose, nothing is cleaned, nothing is re-fetched.
 */
export function displayHeadings(headings: unknown, position: string): readonly ReviewHeading[] {
  if (!Array.isArray(headings)) {
    refuseR50('R50_HEADING_SHAPE_UNSUPPORTED', `${position}: headings are not an array`);
  }
  return Object.freeze(
    headings.map((heading: unknown, index): ReviewHeading => {
      if (typeof heading === 'string') return Object.freeze({ level: null, text: heading });
      if (typeof heading === 'object' && heading !== null && !Array.isArray(heading)) {
        const record = heading as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        const level = record['level'];
        const text = record['text'];
        if (
          keys.length === 2 &&
          keys[0] === 'level' &&
          keys[1] === 'text' &&
          typeof level === 'number' &&
          Number.isInteger(level) &&
          level >= 1 &&
          level <= 6 &&
          typeof text === 'string'
        ) {
          return Object.freeze({ level, text });
        }
      }
      refuseR50(
        'R50_HEADING_SHAPE_UNSUPPORTED',
        `${position}: heading ${String(index)} is neither a string nor { level, text }`,
      );
    }),
  );
}

function presentationOf(row: HandoffSourcePageRow, position: string): ReviewSourcePresentation {
  const fail = (message: string): never =>
    refuseR50('R50_SOURCE_PRESENTATION_INVALID', `${position}: ${message}`);
  if (typeof row.requestedUrl !== 'string' || !/^https?:\/\//.test(row.requestedUrl)) {
    fail('the requested URL is not an http(s) URL');
  }
  if (row.title !== null && typeof row.title !== 'string') fail('the title is not text');
  if (row.declaredLang !== null && typeof row.declaredLang !== 'string') {
    fail('the declared language is not text');
  }
  if (typeof row.mainTextTruncated !== 'boolean') fail('mainTextTruncated is not a boolean');
  if (typeof row.extractionMethod !== 'string' || row.extractionMethod.length === 0) {
    fail('the extraction method is missing');
  }
  if (typeof row.extractionRuleVersion !== 'string' || row.extractionRuleVersion.length === 0) {
    fail('the extraction rule version is missing');
  }
  return Object.freeze({
    requestedUrl: row.requestedUrl,
    title: row.title,
    declaredLang: row.declaredLang,
    headings: displayHeadings(row.headings, position),
    mainTextTruncated: row.mainTextTruncated,
    extractionMethod: row.extractionMethod,
    extractionRuleVersion: row.extractionRuleVersion,
  });
}

/** Indexes one slot's source rows by page id. A page id stored twice refuses. */
export function sourceRowsById(
  rows: readonly HandoffSourcePageRow[],
  slotPosition: number,
): ReadonlyMap<string, HandoffSourcePageRow> {
  if (!Array.isArray(rows)) {
    refuseR50('R50_HANDOFF_INPUT_INVALID', `slot ${String(slotPosition)}: no source rows`);
  }
  const byId = new Map<string, HandoffSourcePageRow>();
  rows.forEach((row, index) => {
    if (typeof row?.pageEvidenceId !== 'string' || row.pageEvidenceId.length === 0) {
      refuseR50(
        'R50_HANDOFF_INPUT_INVALID',
        `slot ${String(slotPosition)}: source row ${String(index)} has no page id`,
      );
    }
    if (byId.has(row.pageEvidenceId)) {
      refuseR50(
        'R50_SOURCE_ROW_DUPLICATE',
        `slot ${String(slotPosition)}: source row ${String(index)} repeats a page id`,
      );
    }
    byId.set(row.pageEvidenceId, row);
  });
  return byId;
}

export interface ResolvedDocumentProvenance {
  readonly mainText: string;
  readonly sourcePresentations: readonly ReviewSourcePresentation[];
}

/**
 * Resolves EVERY source presentation of one exact document, in its frozen
 * provenance order, from the same slot's rows only.
 */
export function resolveDocumentProvenance(
  document: HandoffSlotDocument,
  rows: readonly HandoffSourcePageRow[],
  byId: ReadonlyMap<string, HandoffSourcePageRow>,
  position: string,
): ResolvedDocumentProvenance {
  const ids = document.sourcePageEvidenceIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    refuseR50('R50_SOURCE_ROW_MISSING', `${position}: the document lists no source row`);
  }
  if (new Set(ids).size !== ids.length) {
    refuseR50('R50_SOURCE_ROW_DUPLICATE', `${position}: the document lists a source row twice`);
  }
  const resolved = ids.map((id, index) => {
    const row = byId.get(id);
    if (row === undefined) {
      refuseR50(
        'R50_SOURCE_ROW_MISSING',
        `${position}: source ${String(index)} is not a row of this slot's genuine evidence`,
      );
    }
    if (row.responseSha256 !== document.documentSha256) {
      refuseR50(
        'R50_SOURCE_ROW_DIGEST_MISMATCH',
        `${position}: source ${String(index)} was extracted from a different response`,
      );
    }
    return row;
  });
  const listed = new Set(ids);
  const extra = rows.filter(
    (row) => row.responseSha256 === document.documentSha256 && !listed.has(row.pageEvidenceId),
  );
  if (extra.length !== 0) {
    refuseR50(
      'R50_SOURCE_ROW_EXTRA',
      `${position}: ${String(extra.length)} further source row(s) carry this document's digest`,
    );
  }
  const mainText = resolved[0]!.mainText;
  if (typeof mainText !== 'string') {
    refuseR50('R50_SOURCE_PRESENTATION_INVALID', `${position}: the main text is not text`);
  }
  if (resolved.some((row) => row.mainText !== mainText)) {
    refuseR50(
      'R50_SOURCE_MAIN_TEXT_DISAGREES',
      `${position}: the source presentations of one exact document carry different main text`,
    );
  }
  return Object.freeze({
    mainText,
    sourcePresentations: Object.freeze(
      resolved.map((row, index) => presentationOf(row, `${position} source ${String(index)}`)),
    ),
  });
}

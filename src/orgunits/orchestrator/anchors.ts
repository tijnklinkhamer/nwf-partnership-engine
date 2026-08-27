/**
 * BOUNDED, PII-SAFE DISCOVERY-ANCHOR EXTRACTION.
 *
 * `extract.ts` (2B-1c) deliberately does not persist anchors - ADR 0006 s6
 * left that to whichever later slice actually needs link discovery. This is
 * that slice. This module is a SEPARATE, PURE extraction path over the same
 * already-decoded HTML text `extract.ts` reads: it never returns the raw
 * page body, never returns a `mailto:`/`tel:`/`javascript:`/`data:`/`file:`/
 * `ftp:` target, and always redacts anchor TEXT through the same
 * `redactContactData` extract.ts uses - so a phone number or email address
 * typed as link text can never reach the frontier, candidate persistence, or
 * a root summary.
 *
 * BOUNDED: at most `MAX_DISCOVERED_ANCHORS_PER_PAGE` anchors are returned per
 * page, applied AFTER the scheme/target filter - a mechanical resource limit
 * (constants.ts), not a relevance cutoff.
 *
 * ANCHOR HYGIENE (2026-08-27 shadow validation Pass B, defect 3): the
 * ANCHOR_PATTERN regex below has no notion of HTML comments, `<script>` or
 * `<style>` content - it will happily read an `<a href="...">` shape out of
 * any of them. The shadow validation found this burning 26 of ISAE-SUPAERO's
 * 41 requests (63%) on an escalating URL loop. VERIFIED directly against the
 * persisted `orgunit_fetch_observations` rows for that run
 * (`2b9a87e5-2817-4580-994d-9aaf4b64e2ca`, working database `nwf_pe`): the
 * captured href was the bare RELATIVE string `--><!--` - literally nothing
 * but the artifact itself, no surrounding path text - discovered on
 * `.../news/welcome-to-france-.../` (a WordPress/Elementor page: this
 * host also serves `/elementor_library-sitemap1.xml`). Resolved against
 * that page's own (trailing-slash) URL it became
 * `.../welcome-to-france-.../--%3E%3C!--`; the server answered 301 to the
 * same path plus a trailing slash; that response (200) carried the SAME
 * relative anchor, which resolved again against the now-deeper URL APPENDED
 * ANOTHER COPY of the artifact - `.../--%3E%3C!--/--%3E%3C!--` - and so on,
 * alternating 301/200, growing by one segment per generation, for the
 * remaining 26 requests. Each generation is a distinct string, so neither
 * the frontier's nor `attemptedUrls`' exact-string dedup ever collapsed it.
 * Two independent, general corrections close the whole class, not just this
 * one exact byte sequence:
 *
 *   1. `stripNonContent` (extract.ts) runs FIRST, exactly as it already does
 *      for main-text extraction, so a comment or a `<script>`/`<style>`
 *      block can never be read as if it were live markup at all.
 *   2. `RAW_MARKUP_DELIMITER` rejects any captured href that still contains
 *      a raw, unescaped `<` or `>` - which a well-formed HTML attribute
 *      value can never legitimately carry (HTML5 requires `&lt;`/`&gt;`
 *      there). A raw one only ever means the regex's own quote-matching
 *      crossed a tag/comment/attribute boundary it should never have
 *      crossed, independent of whether that boundary happens to be a
 *      complete, well-formed comment (guard 1 already removes those) or an
 *      orphaned, malformed one (guard 1 cannot see those, because there is
 *      no matching `-->` for it to find).
 *
 * PURE. No network, no database, no filesystem, no clock.
 */
import { redactContactData } from '../web/redact.js';
import { stripNonContent } from '../web/extract.js';
import { MAX_DISCOVERED_ANCHORS_PER_PAGE } from './constants.js';

export interface DiscoveredAnchor {
  /** The href exactly as written in the markup, before resolution against the page URL. */
  readonly hrefRaw: string;
  /** PII-redacted anchor text, or null when the anchor had none. */
  readonly text: string | null;
}

const ANCHOR_PATTERN = /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;

/** Schemes this repository will never hand to the frontier. Checked case-insensitively. */
const DROPPED_SCHEMES = /^\s*(mailto|tel|javascript|data|file|ftp):/i;

/**
 * A raw, unescaped `<` or `>` in a captured href value. See the module
 * comment: a well-formed HTML attribute value never carries either
 * character literally, so one appearing here is proof the capture crossed a
 * markup boundary it should never have crossed - never a real URL.
 */
const RAW_MARKUP_DELIMITER = /[<>]/;

function stripTags(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts discovery anchors from ALREADY charset-decoded HTML text (the same
 * input `extract.ts`'s `extractPage` takes).
 *
 * A `mailto:`/`tel:`/`javascript:`/`data:`/`file:`/`ftp:` href is DROPPED
 * here, at the source - it never becomes a `DiscoveredAnchor`, so no caller
 * downstream can accidentally expose one to the frontier or persist one as
 * evidence. An empty or whitespace-only href is dropped too, and so is one
 * whose capture carries a raw markup-boundary artifact (`RAW_MARKUP_DELIMITER`
 * - see the module comment).
 */
export function extractDiscoveryAnchors(html: string): DiscoveredAnchor[] {
  const anchors: DiscoveredAnchor[] = [];
  // Comments and <script>/<style>/<noscript>/<svg>/<template>/<iframe>
  // content are removed BEFORE the anchor regex ever sees the document -
  // exactly what extractPage does for main-text extraction, and for the
  // same reason: neither is live markup a visitor's browser would ever turn
  // into a real, followable link.
  const contentOnly = stripNonContent(html);
  let match: RegExpExecArray | null;
  ANCHOR_PATTERN.lastIndex = 0;
  while ((match = ANCHOR_PATTERN.exec(contentOnly)) !== null) {
    if (anchors.length >= MAX_DISCOVERED_ANCHORS_PER_PAGE) break;
    const hrefRaw = (match[2] ?? '').trim();
    if (hrefRaw === '' || hrefRaw.startsWith('#')) continue;
    if (DROPPED_SCHEMES.test(hrefRaw)) continue;
    if (RAW_MARKUP_DELIMITER.test(hrefRaw)) continue;

    const rawText = stripTags(match[3] ?? '');
    const text = rawText === '' ? null : redactContactData(rawText);
    anchors.push({ hrefRaw, text });
  }
  return anchors;
}

export type LinkResolution = { ok: true; url: string } | { ok: false };

/**
 * Resolves a raw href against the page it was found on, and strips any
 * fragment - a fragment never reaches the wire (url.ts refuses one on the
 * request URL), so two anchors differing only by fragment must resolve to
 * the SAME frontier URL rather than two.
 */
export function resolveAnchorHref(pageUrl: string, hrefRaw: string): LinkResolution {
  try {
    const resolved = new URL(hrefRaw, pageUrl);
    resolved.hash = '';
    return { ok: true, url: resolved.toString() };
  } catch {
    return { ok: false };
  }
}

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
 *
 * Since fetch policy v5 the orchestrator passes the DOCUMENT BASE here
 * (`resolveDocumentBase`, below), which is the page URL itself whenever the
 * page has no usable `<base href>`. This function's body is byte-identical
 * to v4's, deliberately: that is half of the no-base compatibility proof.
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

/*
 * ---------------------------------------------------------------------------
 * THE HTML DOCUMENT BASE (fetch policy v5).
 *
 * Under v1..v4 every href was resolved against the fetched document URL,
 * whatever the document said. A browser does not do that: HTML resolves a
 * relative href against the DOCUMENT BASE URL, which a `<base href>` element
 * overrides. A page served at "/" with `<base href="/app/">` and an anchor
 * `href="contact/"` links to "/app/contact/"; v4 requested "/contact/"
 * instead - a URL no visitor's browser would ever ask for
 * (docs/evaluation/PHASE_2B_2D_A2_ANCHOR_DOCUMENT_BASE_CAPABILITY_REVIEW_V1.json).
 *
 * THE SELECTION RULE IS THE HTML ONE, NOT "THE FIRST VALID ONE"
 * (owner decision APPROVE_HTML_DOCUMENT_BASE_FIRST_HREF_ELEMENT_SEMANTICS_V1):
 *
 *   1. the FIRST `<base>` element, in document order, that HAS an href
 *      attribute is the only one that counts;
 *   2. a `<base target=...>` with no href claims nothing and is skipped;
 *   3. every later `<base href>` is ignored;
 *   4. the chosen href is resolved against the fetched document URL;
 *   5. if that does not produce an http(s) URL - it fails to parse, or it is
 *      `javascript:`, `data:` or any other scheme - the document base is the
 *      fetched document URL, and the search does NOT continue to a later
 *      `<base href>`.
 *
 * The base is read from `stripNonContent`'s output - the same canonical
 * sanitiser anchor discovery uses - so a `<base>` inside a comment, script,
 * style, noscript, svg, template or iframe is never seen. There is exactly
 * one sanitiser; this module does not write a second.
 *
 * THE BASE CHANGES RESOLUTION ONLY. It is never fetched, never persisted and
 * grants no authority: every URL resolved against it still goes through the
 * orchestrator's `admissibleUrl` (root scope, host policy, URL validation)
 * and then the gateway's own checks, exactly as a v4 URL did. A base on
 * another registrable domain only produces URLs that gate refuses.
 *
 * KNOWN OPEN CAPABILITY (owner decision
 * DEFER_ANCHOR_HREF_CHARACTER_REFERENCE_DECODING_AS_SEPARATE_CAPABILITY_V1):
 * attribute values - anchor hrefs and the base href alike - are used AS
 * WRITTEN. HTML character references (`&amp;`, `&#47;`, ...) are NOT decoded.
 * v5 fixes base ELEMENT SELECTION and URL RESOLUTION for attribute values as
 * this bounded extractor exposes them; it is not a complete HTML parser, and
 * no partial entity decoder is added here.
 * ---------------------------------------------------------------------------
 */

/**
 * One `<base ...>` start tag. The attribute group admits quoted values that
 * contain `>`, so `<base href="/a>b/">` is read as one tag. The lookahead
 * keeps `<basefont>` and a `<base-x>` custom element out.
 */
const BASE_TAG_PATTERN = /<base(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/**
 * One attribute inside a start tag: a name, then optionally `=` and a
 * double-quoted, single-quoted or unquoted value. A valueless attribute
 * (`<base href>`) has an empty value, as in HTML.
 */
const ATTRIBUTE_PATTERN = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

/** The href of one start tag's attribute text, or null when it has no href attribute. */
function hrefAttributeOf(attributes: string): string | null {
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE_PATTERN.exec(attributes)) !== null) {
    // HTML keeps the FIRST occurrence of a duplicated attribute.
    if (match[1]!.toLowerCase() === 'href') return match[2] ?? match[3] ?? match[4] ?? '';
  }
  return null;
}

/**
 * The href of the FIRST `<base>` element that has an href attribute, exactly
 * as written (surrounding whitespace trimmed, as URL parsing would), or null
 * when no `<base>` in the live markup has one.
 *
 * It returns the first href-bearing base's value even when that value is
 * unusable: deciding usability is `resolveDocumentBase`'s job, and returning
 * a LATER base instead would be the "first valid base" reading HTML does not
 * have.
 */
export function extractDocumentBaseHref(html: string): string | null {
  const contentOnly = stripNonContent(html);
  BASE_TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BASE_TAG_PATTERN.exec(contentOnly)) !== null) {
    const href = hrefAttributeOf(match[1] ?? '');
    if (href !== null) return href.trim();
  }
  return null;
}

export type DocumentBase =
  | { readonly source: 'BASE_ELEMENT'; readonly url: string }
  | {
      readonly source: 'DOCUMENT_URL';
      readonly url: string;
      readonly reason: 'NO_BASE_HREF' | 'BASE_HREF_UNPARSEABLE' | 'BASE_HREF_NOT_HTTP';
    };

/**
 * The document base URL: the first href-bearing `<base>`'s value resolved
 * against the FETCHED DOCUMENT URL, or the fetched document URL itself when
 * there is none or it is unusable. Never a later `<base>`.
 */
export function resolveDocumentBase(documentUrl: string, baseHref: string | null): DocumentBase {
  if (baseHref === null)
    return { source: 'DOCUMENT_URL', url: documentUrl, reason: 'NO_BASE_HREF' };
  let resolved: URL;
  try {
    resolved = new URL(baseHref, documentUrl);
  } catch {
    return { source: 'DOCUMENT_URL', url: documentUrl, reason: 'BASE_HREF_UNPARSEABLE' };
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
    return { source: 'DOCUMENT_URL', url: documentUrl, reason: 'BASE_HREF_NOT_HTTP' };
  }
  return { source: 'BASE_ELEMENT', url: resolved.toString() };
}

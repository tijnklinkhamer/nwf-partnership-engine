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
 * PURE. No network, no database, no filesystem, no clock.
 */
import { redactContactData } from '../web/redact.js';
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
 * evidence. An empty or whitespace-only href is dropped too.
 */
export function extractDiscoveryAnchors(html: string): DiscoveredAnchor[] {
  const anchors: DiscoveredAnchor[] = [];
  let match: RegExpExecArray | null;
  ANCHOR_PATTERN.lastIndex = 0;
  while ((match = ANCHOR_PATTERN.exec(html)) !== null) {
    if (anchors.length >= MAX_DISCOVERED_ANCHORS_PER_PAGE) break;
    const hrefRaw = (match[2] ?? '').trim();
    if (hrefRaw === '' || hrefRaw.startsWith('#')) continue;
    if (DROPPED_SCHEMES.test(hrefRaw)) continue;

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

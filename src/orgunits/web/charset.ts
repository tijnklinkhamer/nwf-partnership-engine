/**
 * CHARSET RESOLUTION, in the frozen precedence order.
 *
 * WHY THE ORDER IS WHAT IT IS - MEASURED, NOT SUPPOSED
 *
 *   ADR 0004 s3's holdout finding: a real university page
 *   (`www.sorbonne-nouvelle.fr`) declares its charset in a `<meta>` tag at
 *   BYTE 1050 - past the HTML5 1024-byte prescan window most crawlers use -
 *   behind roughly 130 bytes of blank lines, and its bytes are not valid
 *   UTF-8. Decoding it as UTF-8 destroyed 88 of 89 accented characters. That
 *   is the whole reason this module exists rather than a three-line "check
 *   Content-Type, else assume UTF-8".
 *
 *   The precedence - BOM, then HTTP header, then meta declaration (scanned to
 *   a real 64 KiB ceiling, not 1024 bytes), then a STRICT UTF-8 validity
 *   probe, then a windows-1252 fallback of last resort - matches how a real
 *   browser resolves the same question, because an institution's page was
 *   authored to be readable in one, and a resolver that disagreed with a
 *   browser would silently produce different "evidence" than what a human
 *   visiting the page actually sees.
 *
 * WHY AN UNSUPPORTED EXPLICIT DECLARATION IS A REFUSAL, NOT A FALLBACK
 *
 *   A page that explicitly names its own encoding and gets a decoder that
 *   cannot honour it is not a page this resolver may guess about. Falling
 *   through to windows-1252 over an explicit-but-unsupported label would
 *   silently reinterpret the author's own stated intent and produce mojibake
 *   presented as if it were evidence. `CHARSET_UNRESOLVED` exists so that
 *   never happens: extract.ts (and therefore page evidence) simply does not
 *   run for such a response.
 *
 * PURE. No network, no database, no filesystem, no clock.
 */

export type CharsetSource =
  'HTTP_HEADER' | 'BOM' | 'META_PRESCAN' | 'META_LATE' | 'UTF8_VALIDITY_PROBE' | 'FALLBACK';

export type CharsetConfidence = 'DECLARED' | 'PROBED' | 'ASSUMED';

export type CharsetResolution =
  | {
      outcome: 'RESOLVED';
      charset: string;
      source: CharsetSource;
      confidence: CharsetConfidence;
      text: string;
    }
  | { outcome: 'UNRESOLVED'; reason: string };

/** The 1024-byte window most crawlers use. Kept only as the META_PRESCAN/META_LATE boundary. */
const META_PRESCAN_BYTES = 1024;
/** The hard ceiling for a meta scan. The holdout's real declaration sat at byte 1050. */
const META_SCAN_CEILING_BYTES = 64 * 1024;

/** UTF-8 byte-order mark. */
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16BE_BOM = Buffer.from([0xfe, 0xff]);

function detectBom(bytes: Buffer): { charset: string; length: number } | null {
  if (bytes.subarray(0, 3).equals(UTF8_BOM)) return { charset: 'utf-8', length: 3 };
  // Checked before UTF-16LE: FE FF is a two-byte prefix that UTF-16LE's own
  // BOM (FF FE) cannot also match, but ordering them explicitly documents the
  // check rather than relying on subarray-length coincidence.
  if (bytes.subarray(0, 2).equals(UTF16BE_BOM)) return { charset: 'utf-16be', length: 2 };
  if (bytes.subarray(0, 2).equals(UTF16LE_BOM)) return { charset: 'utf-16le', length: 2 };
  return null;
}

/** Extracts a `charset=` parameter from a `Content-Type` value, per RFC 2045 token/quoted-string rules. */
export function extractHttpCharset(contentType: string | null): string | null {
  if (contentType === null) return null;
  const match = /;\s*charset\s*=\s*("([^"]*)"|'([^']*)'|([^\s;]+))/i.exec(contentType);
  if (match === null) return null;
  const value = match[2] ?? match[3] ?? match[4] ?? '';
  return value.trim() === '' ? null : value.trim();
}

/**
 * Scans up to `META_SCAN_CEILING_BYTES` of the RAW bytes for a charset
 * declaration, and reports whether it fell inside or outside the 1024-byte
 * prescan window.
 *
 * Scanned as LATIN1 deliberately: every byte maps to exactly one code point
 * with no multi-byte interpretation, which keeps the byte OFFSET of a match
 * meaningful (needed to classify META_PRESCAN vs META_LATE) regardless of
 * what the page's real encoding turns out to be. The characters this pattern
 * looks for (`meta`, `charset`, quotes, `=`) are pure ASCII, which is stable
 * across every candidate encoding this module ever selects - UTF-8,
 * UTF-16LE/BE (misdetected as their BOM only, never scanned as meta),
 * windows-1252 - so a latin1 scan finds them correctly regardless of which of
 * those the bytes actually are.
 */
function scanMetaCharset(bytes: Buffer): { charset: string; source: CharsetSource } | null {
  const window = bytes.subarray(0, Math.min(bytes.length, META_SCAN_CEILING_BYTES));
  const text = window.toString('latin1');

  // Only the <head> is a legitimate place to declare a document charset; a
  // <meta charset> appearing after <body> is not a real declaration this
  // resolver should honour, and scanning past it risks matching text that
  // merely LOOKS like a meta tag inside page content.
  const headEnd = /<\/head\b/i.exec(text);
  const headText = headEnd === null ? text : text.slice(0, headEnd.index);

  const metaCharset = /<meta\b[^>]*\bcharset\s*=\s*["']?([a-zA-Z0-9_-]+)["']?[^>]*>/i.exec(
    headText,
  );
  const metaHttpEquiv =
    /<meta\b[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i.exec(
      headText,
    ) ??
    /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*>/i.exec(
      headText,
    );

  let matchIndex: number;
  let charset: string | null;
  if (metaCharset !== null) {
    matchIndex = metaCharset.index;
    charset = metaCharset[1] ?? null;
  } else if (metaHttpEquiv !== null) {
    matchIndex = metaHttpEquiv.index;
    charset = extractHttpCharset(metaHttpEquiv[1] ?? null);
  } else {
    return null;
  }
  if (charset === null || charset.trim() === '') return null;

  const source: CharsetSource = matchIndex < META_PRESCAN_BYTES ? 'META_PRESCAN' : 'META_LATE';
  return { charset: charset.trim(), source };
}

/** Builds a `TextDecoder` for a label, or `null` when Node's ICU does not support it. */
function tryDecoder(label: string, fatal: boolean): InstanceType<typeof TextDecoder> | null {
  try {
    return new TextDecoder(label, { fatal });
  } catch {
    return null;
  }
}

/**
 * Resolves the charset of one response and decodes it, following the frozen
 * precedence: BOM, HTTP header, meta declaration, strict UTF-8 probe,
 * windows-1252 fallback.
 *
 * `httpContentType` is the raw `Content-Type` header value (or `null`);
 * charset extraction from it happens here so callers never have to duplicate
 * the RFC 2045 parameter parsing.
 */
export function resolveCharset(bytes: Buffer, httpContentType: string | null): CharsetResolution {
  const bom = detectBom(bytes);
  if (bom !== null) {
    const decoder = tryDecoder(bom.charset, true);
    if (decoder === null) {
      // Unreachable for the three BOM-detected labels on a full-ICU Node
      // build, but a decode failure here is still an unsupported-declaration
      // refusal rather than a silent fallback, for the same reason as below.
      return {
        outcome: 'UNRESOLVED',
        reason: `BOM declared ${bom.charset}, which this build cannot decode`,
      };
    }
    try {
      const text = decoder.decode(bytes.subarray(bom.length));
      return {
        outcome: 'RESOLVED',
        charset: bom.charset,
        source: 'BOM',
        confidence: 'DECLARED',
        text,
      };
    } catch {
      return {
        outcome: 'UNRESOLVED',
        reason: `BOM declared ${bom.charset} but the body is not valid ${bom.charset}`,
      };
    }
  }

  const httpCharset = extractHttpCharset(httpContentType);
  if (httpCharset !== null) {
    return decodeDeclared(bytes, httpCharset, 'HTTP_HEADER');
  }

  const meta = scanMetaCharset(bytes);
  if (meta !== null) {
    return decodeDeclared(bytes, meta.charset, meta.source);
  }

  const strictUtf8 = tryDecoder('utf-8', true);
  /* c8 ignore next 3 -- utf-8 is always available */
  if (strictUtf8 === null) {
    return { outcome: 'UNRESOLVED', reason: 'no UTF-8 decoder available in this build' };
  }
  try {
    const text = strictUtf8.decode(bytes);
    return {
      outcome: 'RESOLVED',
      charset: 'utf-8',
      source: 'UTF8_VALIDITY_PROBE',
      confidence: 'PROBED',
      text,
    };
  } catch {
    // Falls through to the windows-1252 fallback below.
  }

  const fallbackDecoder = tryDecoder('windows-1252', false);
  /* c8 ignore next 3 -- windows-1252 is always available */
  if (fallbackDecoder === null) {
    return { outcome: 'UNRESOLVED', reason: 'no fallback decoder available in this build' };
  }
  return {
    outcome: 'RESOLVED',
    charset: 'windows-1252',
    source: 'FALLBACK',
    confidence: 'ASSUMED',
    text: fallbackDecoder.decode(bytes),
  };
}

/**
 * Decodes bytes under an EXPLICITLY declared label.
 *
 * An unsupported label is refused outright - never silently repointed at
 * windows-1252 - because the page told us what it is and we could not honour
 * that, which is a different fact from "the page never said".
 */
function decodeDeclared(bytes: Buffer, label: string, source: CharsetSource): CharsetResolution {
  const decoder = tryDecoder(label, false);
  if (decoder === null) {
    return {
      outcome: 'UNRESOLVED',
      reason: `declared charset "${label}" (via ${source}) is not supported by this build`,
    };
  }
  return {
    outcome: 'RESOLVED',
    charset: label.toLowerCase(),
    source,
    confidence: 'DECLARED',
    text: decoder.decode(bytes),
  };
}

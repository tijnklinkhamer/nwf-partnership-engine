/**
 * TRACK B, B2.3 - THE ONE CANONICAL JSON ENCODING OF OWNER-REVIEW DOCUMENTS.
 *
 * Every byte a reviewer signs, and every byte a verifier re-reads, goes
 * through exactly this encoding:
 *
 *   - objects: keys sorted by UTF-16 code unit (Array.prototype.sort), no
 *     duplicates, no whitespace anywhere;
 *   - strings: exactly as JSON.stringify writes them (raw UTF-8 for every
 *     non-control character, lone surrogates escaped);
 *   - null, true, false;
 *   - NO NUMBERS. A review document carries instants, digests and ids as
 *     strings, so no float formatting rule can ever make two encoders
 *     disagree about the same value.
 *
 * Parsing is the inverse PLUS a byte-for-byte re-encoding check: a document
 * is accepted only if canonically re-encoding what JSON.parse returned yields
 * the identical bytes. That one check refuses duplicate keys (JSON.parse
 * silently keeps the last), reordered keys, insignificant whitespace,
 * gratuitous escapes such as `é`, and every number, without a second
 * hand-written parser. Bytes that are not well-formed UTF-8 are refused
 * before JSON is even considered.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */

export type CanonicalValue =
  null | boolean | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };

export class CanonicalEncodingError extends Error {
  constructor(readonly reason: string) {
    super(`canonical encoding refused: ${reason}`);
    this.name = 'CanonicalEncodingError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function encode(value: unknown, depth: number): string {
  if (depth > 16) throw new CanonicalEncodingError('nesting_too_deep');
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => encode(v, depth + 1)).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => {
        const v = value[k];
        if (v === undefined) throw new CanonicalEncodingError('undefined_value');
        return `${JSON.stringify(k)}:${encode(v, depth + 1)}`;
      })
      .join(',')}}`;
  }
  throw new CanonicalEncodingError(
    typeof value === 'number' ? 'number_value' : 'unsupported_value',
  );
}

/** The canonical encoding of `value`, as a string. Throws on anything outside the closed shape. */
export function canonicalJson(value: CanonicalValue): string {
  return encode(value, 0);
}

/** The canonical encoding of `value`, as UTF-8 bytes. */
export function canonicalBytes(value: CanonicalValue): Buffer {
  return Buffer.from(canonicalJson(value), 'utf8');
}

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * Parses bytes that MUST already be the canonical encoding of their value.
 * Anything else - invalid UTF-8, a BOM, duplicate keys, extra whitespace, a
 * number, a different escape or key order - is refused.
 */
export function parseCanonicalBytes(bytes: Uint8Array): CanonicalValue {
  let text: string;
  try {
    text = STRICT_UTF8.decode(bytes);
  } catch {
    throw new CanonicalEncodingError('utf8_invalid');
  }
  if (text.charCodeAt(0) === 0xfeff) throw new CanonicalEncodingError('byte_order_mark');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new CanonicalEncodingError('json_invalid');
  }
  let again: string;
  try {
    again = encode(parsed, 0);
  } catch (error) {
    if (error instanceof CanonicalEncodingError) throw error;
    throw new CanonicalEncodingError('unsupported_value');
  }
  if (again !== text) throw new CanonicalEncodingError('not_canonical');
  return parsed as CanonicalValue;
}

/**
 * A document FILE: the canonical encoding, optionally followed by exactly one
 * newline (what a shell redirect of the CLI output produces). Nothing else.
 */
export function parseCanonicalDocument(bytes: Uint8Array): CanonicalValue {
  const body = bytes.length > 0 && bytes[bytes.length - 1] === 0x0a ? bytes.subarray(0, -1) : bytes;
  return parseCanonicalBytes(body);
}

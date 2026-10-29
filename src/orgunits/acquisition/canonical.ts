/**
 * WW E-Q - THE CANONICAL JSON ENCODING AND KEY HELPERS OF THE CAMPAIGN
 * PROTOCOL.
 *
 * The SAME rules as the OWNER review protocol (ADR 0023 s3.2): keys sorted by
 * UTF-16 code unit, no whitespace, strings exactly as JSON.stringify writes
 * them, null/true/false, and NO NUMBERS; parsing demands that re-encoding the
 * parsed value yields the identical bytes (which refuses duplicate keys,
 * reordering, whitespace, gratuitous escapes and numbers), and refuses invalid
 * UTF-8 and a BOM.
 *
 * WHY A SEPARATE COPY. The B2.3 firewall pins the review protocol
 * (`src/orgunits/subjectReview/`) to its own readers, so a campaign path that
 * imported it would widen that boundary. The campaign protocol therefore
 * carries its own encoder; a unit test proves it agrees byte-for-byte with
 * the review encoder on the same vectors, so the two cannot drift silently.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash, createPublicKey, type KeyObject } from 'node:crypto';

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

export function canonicalJson(value: CanonicalValue): string {
  return encode(value, 0);
}

export function canonicalBytes(value: CanonicalValue): Buffer {
  return Buffer.from(canonicalJson(value), 'utf8');
}

const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Parses bytes that MUST already be the canonical encoding of their value. */
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

/** A document FILE: the canonical encoding, optionally followed by exactly one newline. */
export function parseCanonicalDocument(bytes: Uint8Array): CanonicalValue {
  const body = bytes.length > 0 && bytes[bytes.length - 1] === 0x0a ? bytes.subarray(0, -1) : bytes;
  return parseCanonicalBytes(body);
}

/** DER prefix of an Ed25519 SubjectPublicKeyInfo; the raw 32-byte key follows. */
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** sha256 hex of a raw 32-byte Ed25519 public key - the key's fingerprint. */
export function publicKeyFingerprint(raw: Uint8Array): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** An Ed25519 public KeyObject from its raw 32 bytes; anything else throws. */
export function ed25519PublicKeyFromRaw(raw: Uint8Array): KeyObject {
  if (raw.length !== 32) throw new Error('not a 32-byte Ed25519 public key');
  const key = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('not an Ed25519 public key');
  return key;
}

const TELEPHONE_SHAPE = /[0-9]([ .()+/-]{0,2}[0-9]){8}/;

/**
 * Bounded free text with no contact-shaped content: 1..maxChars code points,
 * no control character, no at-sign, no telephone-shaped digit run. The same
 * rule as discovery-subject notes (identity/admissibility.ts), restated here
 * so this namespace imports nothing from the B2.1 identity layer.
 */
export function isAdmissibleText(candidate: string, maxChars: number): boolean {
  const length = [...candidate].length;
  if (length < 1 || length > maxChars) return false;
  for (let i = 0; i < candidate.length; i += 1) {
    const unit = candidate.charCodeAt(i);
    if (unit <= 0x1f || unit === 0x7f) return false;
  }
  return !candidate.includes('@') && !TELEPHONE_SHAPE.test(candidate);
}

/**
 * TRACK B, B2.5-S0 - THE CANONICAL ENCODING AND DIGESTS OF THE SNAPSHOT-SCOPE
 * MANIFEST.
 *
 * WHY A SECOND ENCODER. The B2.3 review encoder may be imported only by the
 * named B2.4 projection files (the B2.3 firewall's exact-path exception), so
 * this module states its own, narrow rule instead of widening that boundary:
 *
 *   - objects: plain objects only, keys sorted by UTF-16 code unit, no
 *     undefined value, no whitespace anywhere;
 *   - strings: exactly as JSON.stringify writes them;
 *   - null, true, false;
 *   - numbers: NON-NEGATIVE SAFE INTEGERS ONLY (counts and bounds), written
 *     in their one decimal form - never a float, a negative or -0;
 *   - nesting bounded.
 *
 * It encodes; it never parses. Every digest is SHA-256 over a domain-separated
 * prefix naming the contract and the role of the bytes, so a record digest can
 * never be replayed as a manifest digest or as a B2.4 / I0 digest.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash } from 'node:crypto';

import { SNAPSHOT_SCOPE_CONTRACT } from './contract.js';

export type ManifestValue =
  | null
  | boolean
  | string
  | number
  | readonly ManifestValue[]
  | { readonly [key: string]: ManifestValue };

export class ManifestEncodingError extends Error {
  constructor(readonly reason: string) {
    super(`manifest canonical encoding refused: ${reason}`);
    this.name = 'ManifestEncodingError';
  }
}

const MAX_DEPTH = 16;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function encode(value: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new ManifestEncodingError('nesting_too_deep');
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
      throw new ManifestEncodingError('number_not_a_non_negative_safe_integer');
    }
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => encode(v, depth + 1)).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((k) => {
        const v = value[k];
        if (v === undefined) throw new ManifestEncodingError('undefined_value');
        return `${JSON.stringify(k)}:${encode(v, depth + 1)}`;
      })
      .join(',')}}`;
  }
  throw new ManifestEncodingError('unsupported_value');
}

/** The canonical encoding of `value`. Throws on anything outside the closed shape. */
export function manifestCanonicalJson(value: ManifestValue): string {
  return encode(value, 0);
}

/** The digest roles. Each is a distinct domain-separation prefix. */
export type DigestRole = 'record-content' | 'findings' | 'membership' | 'manifest';

/** SHA-256 hex of `<contract>/<role>\n<canonical JSON>`. */
export function manifestDigestOf(role: DigestRole, value: ManifestValue): string {
  return createHash('sha256')
    .update(`${SNAPSHOT_SCOPE_CONTRACT}/${role}\n${manifestCanonicalJson(value)}`, 'utf8')
    .digest('hex');
}

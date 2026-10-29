/**
 * TRACK B, B2.3 - SIGNATURE-FIRST VERIFICATION OF OWNER REVIEW ENVELOPES.
 *
 * The order is the design, and nothing unsigned is ever interpreted:
 *
 *   1. the key id must name a key in the PINNED trust set  -> KEY_UNKNOWN
 *   2. the payload must be canonical base64url within bound -> PAYLOAD_*
 *   3. the signature must be canonical base64url, 64 bytes  -> SIGNATURE_MALFORMED
 *   4. Ed25519 over `UTF8(protocol + "\n") || payload` must
 *      verify under that pinned key                          -> SIGNATURE_INVALID
 *   5. only now: the payload must be canonical JSON          -> PAYLOAD_NOT_CANONICAL
 *   6. ... of exactly the protocol's shape, protocol name,
 *      action audience and validity window                  -> PAYLOAD_* / ACTION_* / VALIDITY_*
 *   7. ... naming the same key id and that key's fingerprint -> PAYLOAD_KEY_MISMATCH /
 *                                                              KEY_FINGERPRINT_MISMATCH
 *
 * What this file does NOT decide: whether the envelope is for THIS database,
 * whether it is fresh by the DATABASE clock, whether its nonce was used, and
 * whether the subject still looks the way the reviewer saw it. Those are
 * properties of the database at execution time and are checked there, under
 * the subject lock (subjectRegistry/writer.ts).
 *
 * `VerifiedReviewEnvelope` is the ONLY production input from which a trusted
 * reviewer context can be derived (subjectRegistry/reviewAuthority.ts). It is
 * sealed: it exists only as the return value of `verify`, and a literal, a
 * clone, a cast or a JSON round-trip of one is not one.
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { createHash, verify as ed25519Verify } from 'node:crypto';

import {
  CanonicalEncodingError,
  parseCanonicalBytes,
  parseCanonicalDocument,
} from './canonical.js';
import {
  REVIEW_ENVELOPE_MAX_BYTES,
  REVIEW_PAYLOAD_MAX_BYTES,
  ReviewProtocolError,
  decodeCanonicalBase64url,
  parseEnvelopeDocument,
  parseReviewPayload,
  reviewSigningBytes,
  type ReviewPayload,
} from './protocol.js';
import { ReviewTrustSet, type TrustedReviewKey } from './trust.js';

export interface SignedPayloadCheck {
  readonly payload: ReviewPayload;
  readonly payloadSha256: string;
  readonly trusted: TrustedReviewKey;
}

/**
 * Steps 1-7 over a key id, a base64url payload and a base64url signature -
 * the shared core of execution-time and read-time verification. Throws
 * ReviewProtocolError; never returns a partially verified value.
 */
export function verifySignedReviewPayload(
  keyId: string,
  payloadText: string,
  signatureText: string,
  trust: ReviewTrustSet,
): SignedPayloadCheck {
  if (!ReviewTrustSet.isTrustSet(trust)) {
    throw new ReviewProtocolError('KEY_UNKNOWN', 'trust_set_not_sealed');
  }
  const trusted = trust.keyFor(keyId);
  if (trusted === undefined) throw new ReviewProtocolError('KEY_UNKNOWN', 'key_id_not_trusted');
  const payloadBytes = decodeCanonicalBase64url(payloadText, 'PAYLOAD_ENCODING_INVALID');
  if (payloadBytes.length > REVIEW_PAYLOAD_MAX_BYTES) {
    throw new ReviewProtocolError('PAYLOAD_SIZE', 'payload_too_large');
  }
  const signature = decodeCanonicalBase64url(signatureText, 'SIGNATURE_MALFORMED');
  if (signature.length !== 64) {
    throw new ReviewProtocolError('SIGNATURE_MALFORMED', 'signature_length');
  }
  let valid: boolean;
  try {
    valid = ed25519Verify(null, reviewSigningBytes(payloadBytes), trusted.key, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new ReviewProtocolError('SIGNATURE_INVALID', 'signature_not_verified');

  // Signed bytes only from here on.
  let json: unknown;
  try {
    json = parseCanonicalBytes(payloadBytes);
  } catch (error) {
    if (error instanceof CanonicalEncodingError) {
      throw new ReviewProtocolError('PAYLOAD_NOT_CANONICAL', error.reason);
    }
    throw error;
  }
  const payload = parseReviewPayload(json);
  if (payload.keyId !== keyId) throw new ReviewProtocolError('PAYLOAD_KEY_MISMATCH', 'key_id');
  if (payload.keyFingerprint !== trusted.entry.fingerprint) {
    throw new ReviewProtocolError('KEY_FINGERPRINT_MISMATCH', 'fingerprint');
  }
  return {
    payload: Object.freeze(payload),
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    trusted,
  };
}

/** One envelope whose signature verified under a pinned key that may still decide. */
export class VerifiedReviewEnvelope {
  readonly #sealed = true;
  readonly #trusted: TrustedReviewKey;
  readonly payload: ReviewPayload;
  readonly keyId: string;
  readonly keyFingerprint: string;
  /** The exact signed payload and signature, stored verbatim with the attestation. */
  readonly signedPayload: string;
  readonly signature: string;
  readonly payloadSha256: string;

  private constructor(
    check: SignedPayloadCheck,
    envelope: { keyId: string; payload: string; signature: string },
  ) {
    this.#trusted = check.trusted;
    this.payload = check.payload;
    this.keyId = envelope.keyId;
    this.keyFingerprint = check.trusted.entry.fingerprint;
    this.signedPayload = envelope.payload;
    this.signature = envelope.signature;
    this.payloadSha256 = check.payloadSha256;
    Object.freeze(this);
  }

  static isVerified(value: unknown): value is VerifiedReviewEnvelope {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * Verifies one envelope FILE's bytes for a NEW decision. A RETIRED or
   * REVOKED key is refused here; activation against the database clock is
   * checked by the executor (`mayDecideAt`).
   */
  static verify(bytes: Uint8Array, trust: ReviewTrustSet): VerifiedReviewEnvelope {
    if (bytes.length === 0 || bytes.length > REVIEW_ENVELOPE_MAX_BYTES) {
      throw new ReviewProtocolError('ENVELOPE_TOO_LARGE', 'envelope_size');
    }
    let document: unknown;
    try {
      document = parseCanonicalDocument(bytes);
    } catch (error) {
      if (error instanceof CanonicalEncodingError) {
        throw new ReviewProtocolError('ENVELOPE_MALFORMED', error.reason);
      }
      throw error;
    }
    const envelope = parseEnvelopeDocument(document);
    const check = verifySignedReviewPayload(
      envelope.keyId,
      envelope.payload,
      envelope.signature,
      trust,
    );
    if (check.trusted.entry.state === 'RETIRED') {
      throw new ReviewProtocolError('KEY_RETIRED', 'key_retired');
    }
    if (check.trusted.entry.state === 'REVOKED') {
      throw new ReviewProtocolError('KEY_REVOKED', 'key_revoked');
    }
    return new VerifiedReviewEnvelope(check, envelope);
  }

  /** May this envelope's key decide at `nowMs`, read from the DATABASE clock? */
  mayDecideAt(nowMs: number): 'OK' | 'KEY_NOT_ACTIVE' | 'KEY_RETIRED' | 'KEY_REVOKED' {
    return this.#trusted.mayDecideAt(nowMs);
  }
}

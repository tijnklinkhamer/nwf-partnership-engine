/**
 * WW E-Q - SIGNATURE-FIRST VERIFICATION OF OWNER CAMPAIGN ENVELOPES.
 *
 * The order is the design (ADR 0023 s3.3, reused): nothing unsigned is ever
 * interpreted.
 *
 *   1. the key id must name a key in the PINNED campaign trust set -> KEY_UNKNOWN
 *   2. the payload must be canonical base64url within bound        -> PAYLOAD_*
 *   3. the signature must be canonical base64url, 64 bytes         -> SIGNATURE_MALFORMED
 *   4. Ed25519 over `UTF8(protocol + "\n") || payload` verifies    -> SIGNATURE_INVALID
 *   5. only now: canonical JSON of exactly the campaign shape      -> PAYLOAD_* / SCOPE_* /
 *                                                                     BUDGET_* / WINDOW_*
 *   6. naming the same key id and that key's fingerprint           -> PAYLOAD_KEY_MISMATCH /
 *                                                                     KEY_FINGERPRINT_MISMATCH
 *
 * What this file does NOT decide: whether the campaign is for THIS database,
 * whether its window is open by the DATABASE clock, and whether it has been
 * started, paused or stopped. Those are checked where the database is
 * (authority.ts).
 *
 * `VerifiedCampaignEnvelope` is sealed: it exists only as the return value of
 * `verify`; a literal, a clone, a cast or a JSON round-trip of one is not one.
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
  CAMPAIGN_ENVELOPE_MAX_BYTES,
  CAMPAIGN_PAYLOAD_MAX_BYTES,
  CampaignProtocolError,
  campaignSigningBytes,
  decodeBase64urlStrict,
  parseCampaignEnvelopeDocument,
  parseCampaignPayload,
  type CampaignPayload,
} from './document.js';
import { CampaignTrustSet, type TrustedCampaignKey } from './trust.js';

export interface SignedCampaignCheck {
  readonly payload: CampaignPayload;
  readonly payloadSha256: string;
  readonly trusted: TrustedCampaignKey;
}

/**
 * Steps 1-6 over a key id, a base64url payload and a base64url signature: the
 * shared core of record-time and use-time verification. Throws
 * CampaignProtocolError; never returns a partially verified value.
 */
export function verifySignedCampaignPayload(
  keyId: string,
  payloadText: string,
  signatureText: string,
  trust: CampaignTrustSet,
): SignedCampaignCheck {
  if (!CampaignTrustSet.isTrustSet(trust)) {
    throw new CampaignProtocolError('KEY_UNKNOWN', 'trust_set_not_sealed');
  }
  const trusted = trust.keyFor(keyId);
  if (trusted === undefined) throw new CampaignProtocolError('KEY_UNKNOWN', 'key_id_not_trusted');
  const payloadBytes = decodeBase64urlStrict(payloadText, 'PAYLOAD_ENCODING_INVALID');
  if (payloadBytes.length > CAMPAIGN_PAYLOAD_MAX_BYTES) {
    throw new CampaignProtocolError('PAYLOAD_SIZE', 'payload_too_large');
  }
  const signature = decodeBase64urlStrict(signatureText, 'SIGNATURE_MALFORMED');
  if (signature.length !== 64) {
    throw new CampaignProtocolError('SIGNATURE_MALFORMED', 'signature_length');
  }
  let valid: boolean;
  try {
    valid = ed25519Verify(null, campaignSigningBytes(payloadBytes), trusted.key, signature);
  } catch {
    valid = false;
  }
  if (!valid) throw new CampaignProtocolError('SIGNATURE_INVALID', 'signature_not_verified');

  // Signed bytes only from here on.
  let json: unknown;
  try {
    json = parseCanonicalBytes(payloadBytes);
  } catch (error) {
    if (error instanceof CanonicalEncodingError) {
      throw new CampaignProtocolError('PAYLOAD_NOT_CANONICAL', error.reason);
    }
    throw error;
  }
  const payload = parseCampaignPayload(json);
  if (payload.keyId !== keyId) throw new CampaignProtocolError('PAYLOAD_KEY_MISMATCH', 'key_id');
  if (payload.keyFingerprint !== trusted.entry.fingerprint) {
    throw new CampaignProtocolError('KEY_FINGERPRINT_MISMATCH', 'fingerprint');
  }
  return {
    payload: Object.freeze(payload),
    payloadSha256: createHash('sha256').update(payloadBytes).digest('hex'),
    trusted,
  };
}

/** One campaign envelope whose signature verified under a pinned key that may still sign. */
export class VerifiedCampaignEnvelope {
  readonly #sealed = true;
  readonly #trusted: TrustedCampaignKey;
  readonly payload: CampaignPayload;
  readonly keyId: string;
  readonly keyFingerprint: string;
  /** The exact signed payload and signature, stored verbatim with the campaign. */
  readonly signedPayload: string;
  readonly signature: string;
  readonly payloadSha256: string;

  private constructor(
    check: SignedCampaignCheck,
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

  static isVerified(value: unknown): value is VerifiedCampaignEnvelope {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /**
   * Verifies one envelope FILE's bytes. A RETIRED or REVOKED key is refused
   * here; activation against the database clock is checked by the recorder.
   */
  static verify(bytes: Uint8Array, trust: CampaignTrustSet): VerifiedCampaignEnvelope {
    if (bytes.length === 0 || bytes.length > CAMPAIGN_ENVELOPE_MAX_BYTES) {
      throw new CampaignProtocolError('ENVELOPE_TOO_LARGE', 'envelope_size');
    }
    let document: unknown;
    try {
      document = parseCanonicalDocument(bytes);
    } catch (error) {
      if (error instanceof CanonicalEncodingError) {
        throw new CampaignProtocolError('ENVELOPE_MALFORMED', error.reason);
      }
      throw error;
    }
    const envelope = parseCampaignEnvelopeDocument(document);
    const check = verifySignedCampaignPayload(
      envelope.keyId,
      envelope.payload,
      envelope.signature,
      trust,
    );
    if (check.trusted.entry.state === 'RETIRED') {
      throw new CampaignProtocolError('KEY_RETIRED', 'key_retired');
    }
    if (check.trusted.entry.state === 'REVOKED') {
      throw new CampaignProtocolError('KEY_REVOKED', 'key_revoked');
    }
    return new VerifiedCampaignEnvelope(check, envelope);
  }

  /** May this envelope's key sign a new campaign at `nowMs`, read from the DATABASE clock? */
  mayDecideAt(nowMs: number): 'OK' | 'KEY_NOT_ACTIVE' | 'KEY_RETIRED' | 'KEY_REVOKED' {
    return this.#trusted.mayDecideAt(nowMs);
  }
}

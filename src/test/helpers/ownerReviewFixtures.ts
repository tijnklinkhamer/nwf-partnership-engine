/**
 * Track B, B2.3 - SYNTHETIC, TEST-ONLY OWNER review keys and envelopes.
 *
 * Every key here is generated in memory by the test run that uses it and is
 * discarded with it: nothing is written to the repository, no key is reused
 * across runs, and every key id carries the `test-` prefix and TEST_ONLY scope
 * that the operational trust set refuses. These are NOT, and can never
 * become, OWNER keys.
 */
import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

import {
  canonicalBytes,
  canonicalJson,
  type CanonicalValue,
} from '../../orgunits/subjectReview/canonical.js';
import {
  OWNER_REVIEW_AUTHORITY,
  REVIEW_PROTOCOL,
  publicKeyFingerprint,
  rawEd25519PublicKey,
  reviewSigningBytes,
  type ReviewIntent,
} from '../../orgunits/subjectReview/protocol.js';
import { signReviewIntent } from '../../orgunits/subjectReview/signer.js';
import {
  ReviewTrustSet,
  type ReviewKeyState,
  type ReviewTrustEntry,
} from '../../orgunits/subjectReview/trust.js';

export interface TestReviewKey {
  readonly keyId: string;
  readonly privateKey: KeyObject;
  readonly publicKeyRaw: Buffer;
  readonly fingerprint: string;
}

/** A fresh in-memory Ed25519 key pair under a `test-` key id. */
export function testReviewKey(keyId = 'test-owner-a'): TestReviewKey {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKeyRaw = rawEd25519PublicKey(createPublicKey(privateKey));
  return { keyId, privateKey, publicKeyRaw, fingerprint: publicKeyFingerprint(publicKeyRaw) };
}

export const KEY_ACTIVATED_AT = '2020-01-01T00:00:00.000Z';

/** A TEST_ONLY trust entry for `key`. */
export function trustEntry(
  key: TestReviewKey,
  state: ReviewKeyState = 'ACTIVE',
  at: { activatedAt?: string; retiredAt?: string | null; revokedAt?: string | null } = {},
): ReviewTrustEntry {
  return {
    keyId: key.keyId,
    fingerprint: key.fingerprint,
    publicKey: key.publicKeyRaw.toString('base64url'),
    authority: OWNER_REVIEW_AUTHORITY,
    protocol: REVIEW_PROTOCOL,
    scope: 'TEST_ONLY',
    state,
    activatedAt: at.activatedAt ?? KEY_ACTIVATED_AT,
    retiredAt: at.retiredAt ?? (state === 'RETIRED' ? '2099-01-01T00:00:00.000Z' : null),
    revokedAt: at.revokedAt ?? (state === 'REVOKED' ? '2099-01-01T00:00:00.000Z' : null),
  };
}

/** An ephemeral TEST_ONLY trust set (vitest only). */
export function testTrust(...entries: ReviewTrustEntry[]): ReviewTrustSet {
  return ReviewTrustSet.ephemeralForVitest(entries);
}

/** Signs `intent` through the production signer, with an in-memory test key. */
export function signIntent(
  intent: ReviewIntent,
  key: TestReviewKey,
  options: { nowMs?: number; lifetimeSeconds?: number } = {},
): string {
  return signReviewIntent(intent, {
    keyId: key.keyId,
    privateKey: key.privateKey,
    nowMs: options.nowMs ?? Date.now(),
    ...(options.lifetimeSeconds !== undefined ? { lifetimeSeconds: options.lifetimeSeconds } : {}),
  }).envelope;
}

/**
 * Signs ARBITRARY payload bytes - bypassing the signer's own checks - so tests
 * can prove the VERIFIER refuses what an honest signer would never produce.
 */
export function signRawPayload(
  payload: Uint8Array,
  key: TestReviewKey,
  options: { prefix?: string; protocol?: string; keyId?: string } = {},
): string {
  const message =
    options.prefix === undefined
      ? reviewSigningBytes(payload)
      : Buffer.concat([Buffer.from(options.prefix, 'utf8'), payload]);
  return `${canonicalJson({
    keyId: options.keyId ?? key.keyId,
    payload: Buffer.from(payload).toString('base64url'),
    protocol: options.protocol ?? REVIEW_PROTOCOL,
    signature: sign(null, message, key.privateKey).toString('base64url'),
  })}\n`;
}

/** The canonical bytes of a payload object (for signRawPayload). */
export function payloadBytes(payload: Record<string, unknown>): Buffer {
  return canonicalBytes(payload as CanonicalValue);
}

/** The decoded payload object of an envelope document. */
export function payloadOf(envelope: string): Record<string, unknown> {
  const doc = JSON.parse(envelope) as { payload: string };
  return JSON.parse(Buffer.from(doc.payload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

/**
 * TRACK B, B2.3 - THE PINNED PUBLIC-KEY TRUST SET FOR OWNER REVIEWS.
 *
 * WHICH KEYS MAY SPEAK FOR THE OWNER IS DECIDED HERE, IN REVIEWED SOURCE, AND
 * NOWHERE ELSE. A key is trusted only by appearing in
 * `OPERATIONAL_OWNER_REVIEW_KEYS` below - never because a CLI caller supplied
 * it, never because an envelope names it, and never from the database (no
 * role, however privileged, can add a row that makes a key trusted: there is
 * no key table). Changing the list is a source change that must pass the
 * repository's own review and governance; ADR 0023 s5 states what such a
 * change must record.
 *
 * THE OPERATIONAL LIST HOLDS ONE KEY: `owner-review-2026-10`, pinned under
 * OWNER record R2-P1 (signed 2026-10-28T13:29:34Z, P1-5) and ACTIVE from
 * 2026-10-28T15:54:00.000Z (ADR 0023 s5 amendment). With no ACTIVE key -
 * the state of every build before it, and of any build in which it is
 * retired or revoked - every production review execution is refused before
 * any connection is opened, and every stored review reads as an integrity
 * hold. Custody, rotation and access remain OWNER decisions; revocation is a
 * reviewed commit setting the entry's state REVOKED.
 *
 * PUBLIC KEYS ONLY. An entry is the raw 32-byte Ed25519 public key (base64url)
 * and its sha256 fingerprint. No private key, seed or passphrase may ever
 * appear in this file or anywhere in the repository; the B2.3 firewall scans
 * for PEM blocks and 64-byte key material.
 *
 * KEY STATES (G3) answer two DIFFERENT questions, kept apart:
 *   1. was an attestation valid under this key's authority WHEN IT WAS
 *      RECORDED? (`validAtRecording`)
 *   2. may it still be used as CURRENT authoritative evidence?
 *      (`currentlyAuthoritative`)
 *   ACTIVE  - signs new decisions; history recorded inside its lifetime is
 *             valid and current.
 *   RETIRED - signs nothing new; history recorded before `retiredAt` stays
 *             valid AND current. Retirement is housekeeping, not suspicion.
 *   REVOKED - signs nothing new; history is preserved as a fact and may have
 *             been valid when recorded, but is NOT current: a compromised key
 *             cannot be told apart from its holder after the fact, so every
 *             review it signed is an INTEGRITY HOLD, never silently dropped
 *             (dropping it would recompute a possibly MORE permissive state).
 *
 * WHAT A SIGNATURE PROVES - AND DOES NOT. A valid signature proves that whoever
 * produced it held the private key listed here. It does not, by itself,
 * prove which person operated that key; that rests on key custody (ADR 0023
 * s4), which is outside what any code can verify.
 *
 * PURE except for one read: the vitest guard of `ephemeralForVitest`.
 */
import {
  OWNER_REVIEW_AUTHORITY,
  REVIEW_KEY_ID,
  REVIEW_PROTOCOL,
  decodeCanonicalBase64url,
  ed25519PublicKeyFromRaw,
  instantMs,
  publicKeyFingerprint,
  ReviewProtocolError,
} from './protocol.js';
import type { KeyObject } from 'node:crypto';

export const REVIEW_KEY_STATES = ['ACTIVE', 'RETIRED', 'REVOKED'] as const;
export type ReviewKeyState = (typeof REVIEW_KEY_STATES)[number];

/** OPERATIONAL entries come from reviewed source; TEST_ONLY entries exist only inside vitest. */
export type ReviewTrustScope = 'OPERATIONAL' | 'TEST_ONLY';

/** One pinned OWNER review public key. */
export interface ReviewTrustEntry {
  readonly keyId: string;
  /** sha256 hex of the raw public key; must agree with `publicKey`. */
  readonly fingerprint: string;
  /** The raw 32-byte Ed25519 public key, unpadded base64url. */
  readonly publicKey: string;
  readonly authority: typeof OWNER_REVIEW_AUTHORITY;
  readonly protocol: typeof REVIEW_PROTOCOL;
  readonly scope: ReviewTrustScope;
  readonly state: ReviewKeyState;
  /** ISO-8601 ms UTC. Nothing recorded before it is valid under this key. */
  readonly activatedAt: string;
  /** Set exactly when state is RETIRED. */
  readonly retiredAt: string | null;
  /** Set exactly when state is REVOKED. */
  readonly revokedAt: string | null;
}

/**
 * THE OPERATIONAL OWNER REVIEW TRUST SET. Exactly one key, pinned by OWNER
 * record R2-P1 (P1-5): a reviewed source change and the separate OWNER
 * activation decision ADR 0023 s5, s12 require. Public material only.
 */
export const OPERATIONAL_OWNER_REVIEW_KEYS: readonly ReviewTrustEntry[] = Object.freeze([
  Object.freeze({
    keyId: 'owner-review-2026-10',
    fingerprint: 'b2c8fcf82c3359d0fd829dbb4cda9cee4007578d3cd8aacd95ad53e5cf11bb86',
    publicKey: 'YpLJSZB1H8ThmwR5KVS9_BI6fYgf5jjuE93AOoqL5nE',
    authority: OWNER_REVIEW_AUTHORITY,
    protocol: REVIEW_PROTOCOL,
    scope: 'OPERATIONAL',
    state: 'ACTIVE',
    activatedAt: '2026-10-28T15:54:00.000Z',
    retiredAt: null,
    revokedAt: null,
  }),
]);

/** Test-only key ids must carry this prefix, and operational ones must not. */
export const TEST_KEY_ID_PREFIX = 'test-';

export class ReviewTrustError extends Error {
  constructor(readonly reason: string) {
    super(`review trust set refused: ${reason}`);
    this.name = 'ReviewTrustError';
  }
}

interface ValidatedEntry {
  readonly entry: ReviewTrustEntry;
  readonly key: KeyObject;
  readonly activatedMs: number;
  readonly retiredMs: number | null;
  readonly revokedMs: number | null;
}

const ENTRY_KEYS = [
  'keyId',
  'fingerprint',
  'publicKey',
  'authority',
  'protocol',
  'scope',
  'state',
  'activatedAt',
  'retiredAt',
  'revokedAt',
].sort();

function at(value: string, what: string): number {
  try {
    return instantMs(value, 'PAYLOAD_SCHEMA_INVALID', what);
  } catch {
    throw new ReviewTrustError(`${what}_invalid`);
  }
}

/**
 * Validates one entry for a set of `scope`. Refuses private-key material, a
 * wrong-length key, a fingerprint that does not match, an inconsistent state,
 * a test key in an operational set and an operational key in a test set.
 */
function validateEntry(raw: unknown, scope: ReviewTrustScope): ValidatedEntry {
  if (typeof raw !== 'object' || raw === null) throw new ReviewTrustError('entry_not_object');
  const e = raw as ReviewTrustEntry;
  const keys = Object.keys(raw).sort();
  if (keys.length !== ENTRY_KEYS.length || keys.some((k, i) => k !== ENTRY_KEYS[i])) {
    throw new ReviewTrustError('entry_fields');
  }
  if (typeof e.keyId !== 'string' || !REVIEW_KEY_ID.test(e.keyId)) {
    throw new ReviewTrustError('key_id_invalid');
  }
  if (e.scope !== scope) throw new ReviewTrustError('entry_scope_mismatch');
  if ((scope === 'TEST_ONLY') !== e.keyId.startsWith(TEST_KEY_ID_PREFIX)) {
    throw new ReviewTrustError('key_id_scope_prefix');
  }
  if (e.authority !== OWNER_REVIEW_AUTHORITY) throw new ReviewTrustError('authority_invalid');
  if (e.protocol !== REVIEW_PROTOCOL) throw new ReviewTrustError('protocol_invalid');
  if (typeof e.publicKey !== 'string' || /PRIVATE|BEGIN|-----/i.test(e.publicKey)) {
    throw new ReviewTrustError('private_key_material');
  }
  let rawKey: Buffer;
  try {
    rawKey = decodeCanonicalBase64url(e.publicKey, 'KEY_UNKNOWN');
  } catch (error) {
    if (error instanceof ReviewProtocolError) throw new ReviewTrustError('public_key_encoding');
    throw error;
  }
  if (rawKey.length === 64) throw new ReviewTrustError('private_key_material');
  if (rawKey.length !== 32) throw new ReviewTrustError('public_key_length');
  let key: KeyObject;
  try {
    key = ed25519PublicKeyFromRaw(rawKey);
  } catch {
    throw new ReviewTrustError('public_key_not_ed25519');
  }
  if (e.fingerprint !== publicKeyFingerprint(rawKey)) {
    throw new ReviewTrustError('fingerprint_mismatch');
  }
  const activatedMs = at(e.activatedAt, 'activated_at');
  const retiredMs = e.retiredAt === null ? null : at(e.retiredAt, 'retired_at');
  const revokedMs = e.revokedAt === null ? null : at(e.revokedAt, 'revoked_at');
  const consistent =
    (e.state === 'ACTIVE' && retiredMs === null && revokedMs === null) ||
    (e.state === 'RETIRED' && retiredMs !== null && revokedMs === null) ||
    (e.state === 'REVOKED' && revokedMs !== null && retiredMs === null);
  if (!consistent) throw new ReviewTrustError('state_inconsistent');
  const endMs = retiredMs ?? revokedMs;
  if (endMs !== null && !(endMs > activatedMs)) throw new ReviewTrustError('lifetime_inverted');
  return { entry: Object.freeze({ ...e }), key, activatedMs, retiredMs, revokedMs };
}

/** Validates a whole list for `scope`; exported so tests can prove what an operational set refuses. */
export function validateTrustEntries(
  entries: readonly unknown[],
  scope: ReviewTrustScope,
): readonly ValidatedEntry[] {
  if (!Array.isArray(entries)) throw new ReviewTrustError('entries_not_array');
  const validated = entries.map((e) => validateEntry(e, scope));
  const ids = new Set(validated.map((v) => v.entry.keyId));
  const prints = new Set(validated.map((v) => v.entry.fingerprint));
  if (ids.size !== validated.length) throw new ReviewTrustError('key_id_duplicate');
  if (prints.size !== validated.length) throw new ReviewTrustError('fingerprint_duplicate');
  return validated;
}

/** The standing of one recorded attestation under its key, answering both G3 questions. */
export interface KeyStanding {
  readonly validAtRecording: boolean;
  readonly currentlyAuthoritative: boolean;
  readonly reasons: readonly string[];
}

/** A trusted key, as the verifier sees it. */
export interface TrustedReviewKey {
  readonly entry: ReviewTrustEntry;
  readonly key: KeyObject;
  /** May this key sign a NEW decision at `nowMs` (the database clock)? */
  readonly mayDecideAt: (nowMs: number) => 'OK' | 'KEY_NOT_ACTIVE' | 'KEY_RETIRED' | 'KEY_REVOKED';
  /** The standing of a decision this key's attestation recorded at `recordedMs`. */
  readonly standingAt: (recordedMs: number) => KeyStanding;
}

function trustedKey(v: ValidatedEntry): TrustedReviewKey {
  return Object.freeze({
    entry: v.entry,
    key: v.key,
    mayDecideAt(nowMs: number) {
      if (v.entry.state === 'REVOKED') return 'KEY_REVOKED' as const;
      if (v.entry.state === 'RETIRED') return 'KEY_RETIRED' as const;
      return nowMs >= v.activatedMs ? ('OK' as const) : ('KEY_NOT_ACTIVE' as const);
    },
    standingAt(recordedMs: number): KeyStanding {
      const reasons: string[] = [];
      if (recordedMs < v.activatedMs) reasons.push('RECORDED_BEFORE_KEY_ACTIVATION');
      if (v.retiredMs !== null && recordedMs >= v.retiredMs) {
        reasons.push('RECORDED_AFTER_KEY_RETIREMENT');
      }
      if (v.revokedMs !== null && recordedMs >= v.revokedMs) {
        reasons.push('RECORDED_AFTER_KEY_REVOCATION');
      }
      const validAtRecording = reasons.length === 0;
      if (v.entry.state === 'REVOKED') reasons.push('KEY_REVOKED');
      return { validAtRecording, currentlyAuthoritative: reasons.length === 0, reasons };
    },
  });
}

/**
 * A sealed trust set. The only operational one is built from the reviewed
 * list above; the only other kind is an ephemeral TEST_ONLY set that cannot
 * be built outside vitest. Neither takes a key from a caller at runtime in
 * production, and a cast, spread or clone of one is not one.
 */
export class ReviewTrustSet {
  readonly #sealed = true;
  readonly scope: ReviewTrustScope;
  readonly #keys: ReadonlyMap<string, TrustedReviewKey>;

  private constructor(scope: ReviewTrustScope, validated: readonly ValidatedEntry[]) {
    this.scope = scope;
    this.#keys = new Map(validated.map((v) => [v.entry.keyId, trustedKey(v)]));
  }

  static isTrustSet(value: unknown): value is ReviewTrustSet {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /** The operational set, from reviewed source only. */
  static operational(): ReviewTrustSet {
    return new ReviewTrustSet(
      'OPERATIONAL',
      validateTrustEntries(OPERATIONAL_OWNER_REVIEW_KEYS, 'OPERATIONAL'),
    );
  }

  /**
   * TEST SEAM. An ephemeral set of synthetic TEST_ONLY keys, for proving the
   * protocol against a disposable database. Throws outside vitest; its keys
   * carry the `test-` prefix and TEST_ONLY scope, which the operational set
   * refuses, so no test key can ever become operational authority.
   */
  static ephemeralForVitest(entries: readonly ReviewTrustEntry[]): ReviewTrustSet {
    if (process.env['VITEST'] !== 'true') {
      throw new ReviewTrustError('test trust set is unavailable outside vitest');
    }
    return new ReviewTrustSet('TEST_ONLY', validateTrustEntries(entries, 'TEST_ONLY'));
  }

  /** The trusted key named `keyId`, or undefined. */
  keyFor(keyId: string): TrustedReviewKey | undefined {
    return this.#keys.get(keyId);
  }

  /** True when at least one key may sign new decisions. */
  hasActiveKey(): boolean {
    return [...this.#keys.values()].some((k) => k.entry.state === 'ACTIVE');
  }

  /** Public entries, for display and audit. */
  entries(): readonly ReviewTrustEntry[] {
    return [...this.#keys.values()].map((k) => k.entry);
  }
}

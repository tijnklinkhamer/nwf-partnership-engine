/**
 * WW E-Q - THE PINNED PUBLIC-KEY TRUST SET FOR OWNER ACQUISITION CAMPAIGNS.
 *
 * WHICH KEYS MAY SIGN A CAMPAIGN IS DECIDED HERE, IN REVIEWED SOURCE, AND
 * NOWHERE ELSE - exactly as ADR 0023 s5 decides it for OWNER reviews, but as a
 * SEPARATE set bound to a SEPARATE authority (`OWNER_ACQUISITION_CAMPAIGN`)
 * and protocol, so a review key can never sign a campaign and a campaign key
 * can never sign a review. A key is trusted only by appearing in
 * `OPERATIONAL_OWNER_CAMPAIGN_KEYS` below: never because a CLI caller, an
 * envelope, an environment variable or a database row names it (there is no
 * key table).
 *
 * THE OPERATIONAL LIST HOLDS ONE KEY: `owner-campaign-2026-10`, pinned under
 * OWNER record R2-P1 (signed 2026-10-28T13:29:34Z, P1-5) and ACTIVE from
 * 2026-10-28T15:54:00.000Z (ADR 0029 s8 amendment). The private key is held
 * only in OWNER custody, never in this repository. Adding, retiring or
 * revoking a key is an OWNER key-custody decision plus a reviewed source
 * change; revocation is a reviewed commit setting the entry's state REVOKED.
 *
 * PUBLIC KEYS ONLY: the raw 32-byte Ed25519 key (base64url) and its sha256
 * fingerprint. Private-key material is refused at load.
 *
 * KEY STATES answer two different questions (ADR 0023 s5):
 *   - may this key sign a NEW campaign now?           ACTIVE only, after activation
 *   - is a campaign recorded under it still authority? ACTIVE, or RETIRED after
 *     the recording; never REVOKED (a revoked key's campaigns stop at once).
 *
 * PURE except for one read: the vitest guard of `vitestOnly`.
 */
import type { KeyObject } from 'node:crypto';

import { ed25519PublicKeyFromRaw, publicKeyFingerprint } from './canonical.js';
import {
  CAMPAIGN_KEY_ID,
  CAMPAIGN_PROTOCOL,
  CampaignProtocolError,
  OWNER_CAMPAIGN_AUTHORITY,
  decodeBase64urlStrict,
  instantMsOf,
} from './document.js';

export const CAMPAIGN_KEY_STATES = ['ACTIVE', 'RETIRED', 'REVOKED'] as const;
export type CampaignKeyState = (typeof CAMPAIGN_KEY_STATES)[number];

export type CampaignTrustScope = 'OPERATIONAL' | 'TEST_ONLY';

/** One pinned OWNER campaign public key. */
export interface CampaignTrustEntry {
  readonly keyId: string;
  readonly fingerprint: string;
  readonly publicKey: string;
  readonly authority: typeof OWNER_CAMPAIGN_AUTHORITY;
  readonly protocol: typeof CAMPAIGN_PROTOCOL;
  readonly scope: CampaignTrustScope;
  readonly state: CampaignKeyState;
  readonly activatedAt: string;
  readonly retiredAt: string | null;
  readonly revokedAt: string | null;
}

/**
 * THE OPERATIONAL OWNER CAMPAIGN TRUST SET. Exactly one key, pinned by OWNER
 * record R2-P1 (P1-5): a reviewed source change AND the OWNER activation
 * decision ADR 0029 s8 requires. Public material only.
 */
export const OPERATIONAL_OWNER_CAMPAIGN_KEYS: readonly CampaignTrustEntry[] = Object.freeze([
  Object.freeze({
    keyId: 'owner-campaign-2026-10',
    fingerprint: '43dbea7551266adffc853f6cff4f054dfc924d7e76d4e2f994320e6091a6581c',
    publicKey: 'icnzFLRZVG-hiMlyY6lMxw1RKDrfVfoFbzz2ROxM_i4',
    authority: OWNER_CAMPAIGN_AUTHORITY,
    protocol: CAMPAIGN_PROTOCOL,
    scope: 'OPERATIONAL',
    state: 'ACTIVE',
    activatedAt: '2026-10-28T15:54:00.000Z',
    retiredAt: null,
    revokedAt: null,
  }),
]);

/** Test-only key ids carry this prefix, and operational ones must not. */
export const TEST_CAMPAIGN_KEY_ID_PREFIX = 'test-';

export class CampaignTrustError extends Error {
  constructor(readonly reason: string) {
    super(`campaign trust set refused: ${reason}`);
    this.name = 'CampaignTrustError';
  }
}

interface ValidatedEntry {
  readonly entry: CampaignTrustEntry;
  readonly key: KeyObject;
  readonly activatedMs: number;
  readonly retiredMs: number | null;
  readonly revokedMs: number | null;
}

const ENTRY_KEYS = [
  'activatedAt',
  'authority',
  'fingerprint',
  'keyId',
  'protocol',
  'publicKey',
  'retiredAt',
  'revokedAt',
  'scope',
  'state',
];

function at(value: unknown, what: string): number {
  try {
    return instantMsOf(value, 'PAYLOAD_SCHEMA_INVALID', what);
  } catch {
    throw new CampaignTrustError(`${what}_invalid`);
  }
}

function validateEntry(raw: unknown, scope: CampaignTrustScope): ValidatedEntry {
  if (typeof raw !== 'object' || raw === null) throw new CampaignTrustError('entry_not_object');
  const e = raw as CampaignTrustEntry;
  const keys = Object.keys(raw).sort();
  if (keys.length !== ENTRY_KEYS.length || keys.some((k, i) => k !== ENTRY_KEYS[i])) {
    throw new CampaignTrustError('entry_fields');
  }
  if (typeof e.keyId !== 'string' || !CAMPAIGN_KEY_ID.test(e.keyId)) {
    throw new CampaignTrustError('key_id_invalid');
  }
  if (e.scope !== scope) throw new CampaignTrustError('entry_scope_mismatch');
  if ((scope === 'TEST_ONLY') !== e.keyId.startsWith(TEST_CAMPAIGN_KEY_ID_PREFIX)) {
    throw new CampaignTrustError('key_id_scope_prefix');
  }
  if (e.authority !== OWNER_CAMPAIGN_AUTHORITY) throw new CampaignTrustError('authority_invalid');
  if (e.protocol !== CAMPAIGN_PROTOCOL) throw new CampaignTrustError('protocol_invalid');
  if (typeof e.publicKey !== 'string' || /PRIVATE|BEGIN|-----/i.test(e.publicKey)) {
    throw new CampaignTrustError('private_key_material');
  }
  let rawKey: Buffer;
  try {
    rawKey = decodeBase64urlStrict(e.publicKey, 'KEY_UNKNOWN');
  } catch (error) {
    if (error instanceof CampaignProtocolError) {
      throw new CampaignTrustError('public_key_encoding');
    }
    throw error;
  }
  if (rawKey.length === 64) throw new CampaignTrustError('private_key_material');
  if (rawKey.length !== 32) throw new CampaignTrustError('public_key_length');
  let key: KeyObject;
  try {
    key = ed25519PublicKeyFromRaw(rawKey);
  } catch {
    throw new CampaignTrustError('public_key_not_ed25519');
  }
  if (e.fingerprint !== publicKeyFingerprint(rawKey)) {
    throw new CampaignTrustError('fingerprint_mismatch');
  }
  const activatedMs = at(e.activatedAt, 'activated_at');
  const retiredMs = e.retiredAt === null ? null : at(e.retiredAt, 'retired_at');
  const revokedMs = e.revokedAt === null ? null : at(e.revokedAt, 'revoked_at');
  const consistent =
    (e.state === 'ACTIVE' && retiredMs === null && revokedMs === null) ||
    (e.state === 'RETIRED' && retiredMs !== null && revokedMs === null) ||
    (e.state === 'REVOKED' && revokedMs !== null && retiredMs === null);
  if (!consistent) throw new CampaignTrustError('state_inconsistent');
  const endMs = retiredMs ?? revokedMs;
  if (endMs !== null && !(endMs > activatedMs)) throw new CampaignTrustError('lifetime_inverted');
  return { entry: Object.freeze({ ...e }), key, activatedMs, retiredMs, revokedMs };
}

/** Validates a whole list for `scope`; exported so tests can prove what an operational set refuses. */
export function validateCampaignTrustEntries(
  entries: readonly unknown[],
  scope: CampaignTrustScope,
): readonly ValidatedEntry[] {
  if (!Array.isArray(entries)) throw new CampaignTrustError('entries_not_array');
  const validated = entries.map((e) => validateEntry(e, scope));
  if (new Set(validated.map((v) => v.entry.keyId)).size !== validated.length) {
    throw new CampaignTrustError('key_id_duplicate');
  }
  if (new Set(validated.map((v) => v.entry.fingerprint)).size !== validated.length) {
    throw new CampaignTrustError('fingerprint_duplicate');
  }
  return validated;
}

export type CampaignKeyDecision = 'OK' | 'KEY_NOT_ACTIVE' | 'KEY_RETIRED' | 'KEY_REVOKED';

/** A trusted campaign key, as the verifier sees it. */
export interface TrustedCampaignKey {
  readonly entry: CampaignTrustEntry;
  readonly key: KeyObject;
  /** May this key sign a NEW campaign at `nowMs` (the database clock)? */
  readonly mayDecideAt: (nowMs: number) => CampaignKeyDecision;
  /** Is a campaign RECORDED at `recordedMs` still authority under this key? */
  readonly authoritativeFor: (recordedMs: number) => boolean;
}

function trustedKey(v: ValidatedEntry): TrustedCampaignKey {
  return Object.freeze({
    entry: v.entry,
    key: v.key,
    mayDecideAt(nowMs: number): CampaignKeyDecision {
      if (v.entry.state === 'REVOKED') return 'KEY_REVOKED';
      if (v.entry.state === 'RETIRED') return 'KEY_RETIRED';
      return nowMs >= v.activatedMs ? 'OK' : 'KEY_NOT_ACTIVE';
    },
    authoritativeFor(recordedMs: number): boolean {
      if (v.entry.state === 'REVOKED') return false;
      if (recordedMs < v.activatedMs) return false;
      return v.retiredMs === null || recordedMs < v.retiredMs;
    },
  });
}

/**
 * A sealed campaign trust set: the operational one, from reviewed source
 * only, or an ephemeral TEST_ONLY set that cannot be built outside vitest.
 */
export class CampaignTrustSet {
  readonly #sealed = true;
  readonly scope: CampaignTrustScope;
  readonly #keys: ReadonlyMap<string, TrustedCampaignKey>;

  private constructor(scope: CampaignTrustScope, validated: readonly ValidatedEntry[]) {
    this.scope = scope;
    this.#keys = new Map(validated.map((v) => [v.entry.keyId, trustedKey(v)]));
  }

  static isTrustSet(value: unknown): value is CampaignTrustSet {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /** The operational set, from reviewed source only. */
  static operational(): CampaignTrustSet {
    return new CampaignTrustSet(
      'OPERATIONAL',
      validateCampaignTrustEntries(OPERATIONAL_OWNER_CAMPAIGN_KEYS, 'OPERATIONAL'),
    );
  }

  /**
   * TEST SEAM. Synthetic TEST_ONLY keys for proving the protocol against a
   * disposable database. Throws outside vitest; a `test-` key id and the
   * TEST_ONLY scope are refused by the operational set.
   */
  static vitestOnly(entries: readonly CampaignTrustEntry[]): CampaignTrustSet {
    if (process.env['VITEST'] !== 'true') {
      throw new CampaignTrustError('test trust set is unavailable outside vitest');
    }
    return new CampaignTrustSet('TEST_ONLY', validateCampaignTrustEntries(entries, 'TEST_ONLY'));
  }

  keyFor(keyId: string): TrustedCampaignKey | undefined {
    return this.#keys.get(keyId);
  }

  hasActiveKey(): boolean {
    return [...this.#keys.values()].some((k) => k.entry.state === 'ACTIVE');
  }

  entries(): readonly CampaignTrustEntry[] {
    return [...this.#keys.values()].map((k) => k.entry);
  }
}

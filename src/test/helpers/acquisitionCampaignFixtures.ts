/**
 * WW E-Q - SYNTHETIC, TEST-ONLY OWNER campaign keys and signed campaigns.
 *
 * Every key here is generated in memory by the test run that uses it and is
 * discarded with it: nothing is written to the repository, and every key id
 * carries the `test-` prefix and TEST_ONLY scope that the operational campaign
 * trust set refuses. These are NOT, and can never become, OWNER keys.
 */
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  type KeyObject,
} from 'node:crypto';

import {
  canonicalBytes,
  canonicalJson,
  type CanonicalValue,
} from '../../orgunits/acquisition/canonical.js';
import {
  CAMPAIGN_ACTION,
  CAMPAIGN_DOCUMENT_VERSION,
  CAMPAIGN_DOCUMENT_VERSION_V2,
  CAMPAIGN_DOCUMENT_VERSION_V3,
  CAMPAIGN_PROTOCOL,
  OWNER_CAMPAIGN_AUTHORITY,
  campaignSigningBytes,
} from '../../orgunits/acquisition/document.js';
import {
  CampaignTrustSet,
  type CampaignKeyState,
  type CampaignTrustEntry,
} from '../../orgunits/acquisition/trust.js';

export interface TestCampaignKey {
  readonly keyId: string;
  readonly privateKey: KeyObject;
  readonly publicKeyRaw: Buffer;
  readonly fingerprint: string;
}

function rawPublicKey(key: KeyObject): Buffer {
  const der = key.export({ format: 'der', type: 'spki' });
  return Buffer.from(der.subarray(12));
}

/** A fresh in-memory Ed25519 key pair under a `test-` key id. */
export function testCampaignKey(keyId = 'test-campaign-owner'): TestCampaignKey {
  const { privateKey } = generateKeyPairSync('ed25519');
  const publicKeyRaw = rawPublicKey(createPublicKey(privateKey));
  return {
    keyId,
    privateKey,
    publicKeyRaw,
    fingerprint: createHash('sha256').update(publicKeyRaw).digest('hex'),
  };
}

export const CAMPAIGN_KEY_ACTIVATED_AT = '2020-01-01T00:00:00.000Z';

export function campaignTrustEntry(
  key: TestCampaignKey,
  state: CampaignKeyState = 'ACTIVE',
): CampaignTrustEntry {
  return {
    keyId: key.keyId,
    fingerprint: key.fingerprint,
    publicKey: key.publicKeyRaw.toString('base64url'),
    authority: OWNER_CAMPAIGN_AUTHORITY,
    protocol: CAMPAIGN_PROTOCOL,
    scope: 'TEST_ONLY',
    state,
    activatedAt: CAMPAIGN_KEY_ACTIVATED_AT,
    retiredAt: state === 'RETIRED' ? '2099-01-01T00:00:00.000Z' : null,
    revokedAt: state === 'REVOKED' ? '2099-01-01T00:00:00.000Z' : null,
  };
}

export function testCampaignTrust(...entries: CampaignTrustEntry[]): CampaignTrustSet {
  return CampaignTrustSet.vitestOnly(entries);
}

export interface CampaignDraft {
  campaignKey?: string;
  environmentId: string;
  startsAtMs?: number;
  endsAtMs?: number;
  issuedAtMs?: number;
  geographies?: string[];
  sourceKinds?: string[];
  stages?: string[];
  searchGrantIds?: string[];
  budgets?: Partial<Record<string, string>>;
  purpose?: string;
  /** WW H-ACQ: set to sign a v2 document carrying this signed link-out depth. */
  linkOutMaxHops?: string;
  /** R2: set to sign a v3 document continuing these nominations (depth defaults to '1'). */
  continuation?: { predecessorCampaignId: string; nominationIds: string[] };
}

export const DEFAULT_BUDGETS: Readonly<Record<string, string>> = {
  maxAttemptsPerItem: '3',
  maxAwaitingHumanBacklog: '50',
  maxConcurrency: '2',
  maxGatewayRequests: '600',
  maxItemsPerRegistrableDomain: '20',
  maxResearchRoots: '10',
  maxSearchRuns: '10',
  maxWorkItems: '500',
};

let counter = 0;

/** The payload OBJECT a test signs (strings only), with sensible defaults. */
export function campaignPayloadObject(
  key: TestCampaignKey,
  draft: CampaignDraft,
): Record<string, CanonicalValue> {
  counter += 1;
  const now = Date.now();
  return {
    action: CAMPAIGN_ACTION,
    budgets: { ...DEFAULT_BUDGETS, ...draft.budgets } as Record<string, string>,
    campaignKey: draft.campaignKey ?? `test-campaign-${process.pid}-${counter}-v1`,
    contractVersion: '1',
    document:
      draft.continuation !== undefined
        ? CAMPAIGN_DOCUMENT_VERSION_V3
        : draft.linkOutMaxHops === undefined
          ? CAMPAIGN_DOCUMENT_VERSION
          : CAMPAIGN_DOCUMENT_VERSION_V2,
    environmentId: draft.environmentId,
    issuedAt: new Date(draft.issuedAtMs ?? now).toISOString(),
    keyFingerprint: key.fingerprint,
    keyId: key.keyId,
    nonce: randomBytes(32).toString('base64url'),
    protocol: CAMPAIGN_PROTOCOL,
    purpose: draft.purpose ?? 'Synthetic test campaign; fictitious work only.',
    scope: {
      ...(draft.continuation === undefined
        ? {}
        : {
            continuation: {
              nominationIds: [...draft.continuation.nominationIds],
              predecessorCampaignId: draft.continuation.predecessorCampaignId,
            },
          }),
      geographies: draft.geographies ?? ['NL'],
      ...(draft.linkOutMaxHops === undefined && draft.continuation === undefined
        ? {}
        : { linkOutMaxHops: draft.linkOutMaxHops ?? '1' }),
      searchGrantIds:
        draft.searchGrantIds ??
        ((draft.sourceKinds ?? ['SEARCH_GRANT']).includes('SEARCH_GRANT') ? [randomUUID()] : []),
      sourceKinds: draft.sourceKinds ?? ['SEARCH_GRANT'],
      stages: draft.stages ?? ['DISCOVERED'],
    },
    window: {
      endsAt: new Date(draft.endsAtMs ?? now + 24 * 3600 * 1000).toISOString(),
      startsAt: new Date(draft.startsAtMs ?? now - 60 * 1000).toISOString(),
    },
  };
}

/** Signs canonical payload bytes; `prefix` lets a test sign under ANOTHER protocol's line. */
export function signCampaignBytes(
  payloadBytes: Buffer,
  key: TestCampaignKey,
  options: { prefix?: string; keyId?: string; protocol?: string } = {},
): string {
  const message =
    options.prefix === undefined
      ? campaignSigningBytes(payloadBytes)
      : Buffer.concat([Buffer.from(options.prefix, 'utf8'), payloadBytes]);
  return `${canonicalJson({
    keyId: options.keyId ?? key.keyId,
    payload: payloadBytes.toString('base64url'),
    protocol: options.protocol ?? CAMPAIGN_PROTOCOL,
    signature: sign(null, message, key.privateKey).toString('base64url'),
  })}\n`;
}

/** A signed campaign envelope (text) for `draft`. */
export function signedCampaign(key: TestCampaignKey, draft: CampaignDraft): string {
  return signCampaignBytes(canonicalBytes(campaignPayloadObject(key, draft)), key);
}

export { canonicalBytes };

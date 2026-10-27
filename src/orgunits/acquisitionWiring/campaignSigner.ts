/**
 * WW E-W - THE OFFLINE OWNER CAMPAIGN SIGNER AND THE UNSIGNED TEMPLATE
 * (ADR 0030 s7; the ADR 0023 s6 offline-signer pattern, for campaigns).
 *
 * An UNSIGNED campaign is a DRAFT (`nwf-pe.acquisition-campaign-draft.v1`):
 * exactly the campaign payload's OWNER-chosen fields - campaign key,
 * environment, purpose, window, scope, budgets - and nothing the signer must
 * set. `signCampaignDraft` adds the protocol constants, the signer's key id
 * and fingerprint, a fresh nonce and the issuance instant, validates the
 * result with the SAME parser the verifier uses (`parseCampaignPayload`),
 * signs `UTF8("nwf-pe.acquisition-campaign/1\n") || canonical payload` with
 * Ed25519, verifies its own signature, and returns the envelope document.
 *
 * KEY CUSTODY is the B2.3 signer's, reused: the key is an ENCRYPTED PKCS#8
 * PEM under owner-only permissions, decrypted only by `decryptSigningKey`
 * (subjectReview/signer.ts) with a passphrase read from the terminal with echo
 * off; this file never reads, writes or prints key material. It needs no
 * network and no database.
 *
 * SIGNING GRANTS NOTHING: an envelope counts only if the verifying Engine's
 * PINNED campaign trust set lists the key, and that set is EMPTY in this
 * build. Every envelope is refused KEY_UNKNOWN until an OWNER key decision.
 *
 * The template (`campaignTemplate`) emits a conservative draft: every worker
 * stage, only the SEARCH_GRANT and LINK_OUT source kinds, a window of at most
 * 14 days, and small budgets well inside the mechanical bounds.
 *
 * PURE except for the node:crypto signing calls; the CLI does the file IO.
 */
import {
  createPublicKey,
  randomBytes,
  sign as ed25519Sign,
  verify as ed25519Verify,
  type KeyObject,
} from 'node:crypto';

import {
  CAMPAIGN_ACTION,
  CAMPAIGN_DOCUMENT_VERSION,
  CAMPAIGN_PROTOCOL,
  CampaignProtocolError,
  WORLDWIDE,
  WORKER_STAGES,
  type CampaignPayload,
} from '../acquisition/index.js';
import {
  CAMPAIGN_KEY,
  CAMPAIGN_KEY_ID,
  campaignPayloadBytes,
  campaignSigningBytes,
  parseCampaignPayload,
} from '../acquisition/document.js';
import { canonicalJson, publicKeyFingerprint } from '../acquisition/canonical.js';

export const CAMPAIGN_DRAFT_VERSION = 'nwf-pe.acquisition-campaign-draft.v1';
/** The template never proposes a window longer than this (the protocol allows 30 days). */
export const TEMPLATE_MAX_WINDOW_DAYS = 14;
export const TEMPLATE_DEFAULT_WINDOW_DAYS = 7;

/** Conservative template budgets: decimal strings, as the payload carries them. */
export const TEMPLATE_BUDGETS: Readonly<Record<string, string>> = Object.freeze({
  maxAttemptsPerItem: '3',
  maxAwaitingHumanBacklog: '25',
  maxConcurrency: '1',
  maxGatewayRequests: '600',
  maxItemsPerRegistrableDomain: '12',
  maxResearchRoots: '10',
  maxSearchRuns: '4',
  maxWorkItems: '300',
});

export class CampaignSigningRefusal extends Error {
  constructor(readonly reason: string) {
    super(`campaign signing refused: ${reason}`);
    this.name = 'CampaignSigningRefusal';
  }
}

export interface CampaignDraft {
  readonly draft: typeof CAMPAIGN_DRAFT_VERSION;
  readonly campaignKey: string;
  readonly environmentId: string;
  readonly purpose: string;
  readonly window: { readonly startsAt: string; readonly endsAt: string };
  readonly scope: {
    readonly geographies: readonly string[];
    readonly searchGrantIds: readonly string[];
    readonly sourceKinds: readonly string[];
    readonly stages: readonly string[];
  };
  readonly budgets: Readonly<Record<string, string>>;
}

const DRAFT_KEYS = [
  'budgets',
  'campaignKey',
  'draft',
  'environmentId',
  'purpose',
  'scope',
  'window',
];

/** Parses a draft document's JSON value: exactly the draft keys, nothing else. */
export function parseCampaignDraft(value: unknown): CampaignDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CampaignSigningRefusal('draft_not_object');
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== DRAFT_KEYS.length || keys.some((k, i) => k !== DRAFT_KEYS[i])) {
    throw new CampaignSigningRefusal('draft_fields');
  }
  const d = value as CampaignDraft;
  if (d.draft !== CAMPAIGN_DRAFT_VERSION) throw new CampaignSigningRefusal('draft_version');
  return d;
}

export interface TemplateInput {
  readonly campaignKey: string;
  readonly environmentId: string;
  readonly geographies: readonly string[];
  readonly searchGrantIds: readonly string[];
  readonly nowMs: number;
  readonly windowDays?: number;
  readonly purpose?: string;
}

/** A conservative unsigned draft. Refuses a window beyond 14 days or a malformed key. */
export function campaignTemplate(input: TemplateInput): CampaignDraft {
  const days = input.windowDays ?? TEMPLATE_DEFAULT_WINDOW_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > TEMPLATE_MAX_WINDOW_DAYS) {
    throw new CampaignSigningRefusal('window_days_out_of_bounds');
  }
  if (!CAMPAIGN_KEY.test(input.campaignKey))
    throw new CampaignSigningRefusal('campaign_key_invalid');
  const geographies = [...input.geographies];
  if (geographies.length === 0) throw new CampaignSigningRefusal('geography_required');
  const startsMs = Math.floor(input.nowMs / 1000) * 1000;
  const sourceKinds = input.searchGrantIds.length > 0 ? ['SEARCH_GRANT', 'LINK_OUT'] : ['LINK_OUT'];
  return {
    draft: CAMPAIGN_DRAFT_VERSION,
    campaignKey: input.campaignKey,
    environmentId: input.environmentId,
    purpose:
      input.purpose ??
      `Bounded acquisition campaign for ${geographies.join(' ')}; identity review stays a per-subject OWNER act.`,
    window: {
      startsAt: new Date(startsMs).toISOString(),
      endsAt: new Date(startsMs + days * 24 * 3600 * 1000).toISOString(),
    },
    scope: {
      geographies:
        geographies.length === 1 && geographies[0] === WORLDWIDE ? [WORLDWIDE] : geographies,
      searchGrantIds: [...input.searchGrantIds],
      sourceKinds,
      stages: [...WORKER_STAGES],
    },
    budgets: { ...TEMPLATE_BUDGETS },
  };
}

export interface SignedCampaign {
  /** The canonical envelope document plus one newline, ready to write. */
  readonly envelope: string;
  readonly payload: CampaignPayload;
}

/** The Ed25519 raw public key of a private key. */
function rawPublicKey(privateKey: KeyObject): Buffer {
  const der = createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  return Buffer.from(der.subarray(der.length - 32));
}

/** Signs ONE draft. Opens nothing; reads only the clock value it is given. */
export function signCampaignDraft(
  draft: CampaignDraft,
  key: { readonly keyId: string; readonly privateKey: KeyObject; readonly nowMs: number },
): SignedCampaign {
  if (!CAMPAIGN_KEY_ID.test(key.keyId)) throw new CampaignSigningRefusal('key_id_invalid');
  if (key.privateKey.asymmetricKeyType !== 'ed25519') {
    throw new CampaignSigningRefusal('key_not_ed25519');
  }
  if (!Number.isSafeInteger(key.nowMs)) throw new CampaignSigningRefusal('clock_invalid');
  const parsed = parseCampaignDraft(draft);
  let payload: CampaignPayload;
  try {
    payload = parseCampaignPayload({
      action: CAMPAIGN_ACTION,
      budgets: { ...parsed.budgets },
      campaignKey: parsed.campaignKey,
      contractVersion: '1',
      document: CAMPAIGN_DOCUMENT_VERSION,
      environmentId: parsed.environmentId,
      issuedAt: new Date(key.nowMs).toISOString(),
      keyFingerprint: publicKeyFingerprint(rawPublicKey(key.privateKey)),
      keyId: key.keyId,
      nonce: randomBytes(32).toString('base64url'),
      protocol: CAMPAIGN_PROTOCOL,
      purpose: parsed.purpose,
      scope: {
        geographies: [...parsed.scope.geographies],
        searchGrantIds: [...parsed.scope.searchGrantIds],
        sourceKinds: [...parsed.scope.sourceKinds],
        stages: [...parsed.scope.stages],
      },
      window: { endsAt: parsed.window.endsAt, startsAt: parsed.window.startsAt },
    });
  } catch (error) {
    if (error instanceof CampaignProtocolError) {
      throw new CampaignSigningRefusal(`${error.code}:${error.detail}`);
    }
    throw error;
  }
  const bytes = campaignPayloadBytes(payload);
  const message = campaignSigningBytes(bytes);
  const signature = ed25519Sign(null, message, key.privateKey);
  if (!ed25519Verify(null, message, createPublicKey(key.privateKey), signature)) {
    throw new CampaignSigningRefusal('self_verification_failed');
  }
  const envelope = canonicalJson({
    keyId: key.keyId,
    payload: bytes.toString('base64url'),
    protocol: CAMPAIGN_PROTOCOL,
    signature: signature.toString('base64url'),
  });
  return { envelope: `${envelope}\n`, payload };
}

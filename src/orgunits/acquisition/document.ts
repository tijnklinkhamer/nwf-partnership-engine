/**
 * WW E-Q - THE OWNER-SIGNED ACQUISITION CAMPAIGN DOCUMENT
 * (`nwf-pe.acquisition-campaign.v1`, since WW H-ACQ `.v2` with a signed
 * link-out depth, and since R2 `.v3` with a signed CONTINUATION of a named
 * predecessor campaign's stranded nominations; protocol
 * `nwf-pe.acquisition-campaign/1`).
 *
 * The same envelope discipline as the OWNER review protocol (ADR 0023 s3),
 * with its OWN protocol line, action and trust set:
 *
 *   signed PAYLOAD  the campaign: key, environment, window, scope, budgets,
 *                   purpose, plus the signer's key id, fingerprint, nonce and
 *                   issuance instant - canonical JSON, strings only;
 *   ENVELOPE        `{keyId, payload, protocol, signature}` - the payload's
 *                   canonical bytes in unpadded base64url and an Ed25519
 *                   signature over `UTF8(protocol + "\n") || payloadBytes`.
 *
 * The protocol line is inside the signed bytes, so no signature made for the
 * OWNER review protocol (or any Operator protocol) can verify as a campaign,
 * and a campaign can never be replayed as a review.
 *
 * Every object has an EXACT key set; an unknown, missing or mistyped field,
 * a duplicated scope value, a budget outside its mechanical bound or a window
 * longer than 30 days is a refusal, never ignored. The purpose is bounded
 * text with no contact-shaped content. Budgets are DECIMAL
 * STRINGS because the canonical encoding admits no numbers (ADR 0023 s3.2).
 *
 * Nothing here decides whether a key is trusted (trust.ts) or whether the
 * window is open NOW (the database clock decides that - authority.ts).
 *
 * PURE: no socket, no database, no filesystem, no environment, no clock.
 */
import { canonicalBytes, isAdmissibleText, type CanonicalValue } from './canonical.js';
import {
  SOURCE_KINDS,
  UUID,
  WORKER_STAGES,
  type SourceKind,
  type WorkerStage,
} from './vocabulary.js';

export const CAMPAIGN_DOCUMENT_VERSION = 'nwf-pe.acquisition-campaign.v1';
/**
 * WW H-ACQ (ADR 0030 s13, P2-5): v2 adds ONE signed scope field,
 * `linkOutMaxHops` (decimal string, 0..3). A v1 document stays verifiable and
 * means exactly ONE link-out hop - a link-out root only from research of a
 * SEARCH_GRANT or SEED subject, never from research of a link-out subject.
 */
export const CAMPAIGN_DOCUMENT_VERSION_V2 = 'nwf-pe.acquisition-campaign.v2';
/**
 * R2 (ADR 0029 s12, migration 0029): v3 is v2 plus ONE signed scope field,
 * `continuation = { predecessorCampaignId, nominationIds }`: the OWNER names
 * a predecessor campaign and, IN PRIORITY ORDER, 1..200 distinct nominations
 * whose NOMINATED items there passed de-duplication but never received a
 * child before that campaign's work-item budget was spent. The worker adopts
 * each eligible one, once, into THIS campaign and charges it to THIS
 * campaign's signed budgets. A v3 document must list SEARCH_GRANT (the
 * adopted items keep that source kind, so the unchanged scope rules apply).
 */
export const CAMPAIGN_DOCUMENT_VERSION_V3 = 'nwf-pe.acquisition-campaign.v3';
export const CAMPAIGN_DOCUMENT_VERSIONS = Object.freeze([
  CAMPAIGN_DOCUMENT_VERSION,
  CAMPAIGN_DOCUMENT_VERSION_V2,
  CAMPAIGN_DOCUMENT_VERSION_V3,
] as const);
/** The most nominations one v3 document may list (mirrored by migration 0029). */
export const CAMPAIGN_CONTINUATION_MAX_NOMINATIONS = 200;
export type CampaignDocumentVersion = (typeof CAMPAIGN_DOCUMENT_VERSIONS)[number];
/** What a v1 document means (the conservative reading of v1's behaviour). */
export const CAMPAIGN_V1_LINK_OUT_MAX_HOPS = 1;
/** Mechanical bounds of a v2 `linkOutMaxHops` (mirrored by `acquisition_campaigns_link_out_hops_chk`). */
export const CAMPAIGN_LINK_OUT_MAX_HOPS_BOUNDS = Object.freeze([0, 3] as const);
export const CAMPAIGN_PROTOCOL = 'nwf-pe.acquisition-campaign/1';
export const CAMPAIGN_SIGNING_PREFIX = `${CAMPAIGN_PROTOCOL}\n`;
export const CAMPAIGN_CONTRACT_VERSION = '1';
/** The ONE action a campaign envelope can authorise. */
export const CAMPAIGN_ACTION = 'RUN_ACQUISITION_CAMPAIGN';
/** The authority every trusted campaign key entry must name. */
export const OWNER_CAMPAIGN_AUTHORITY = 'OWNER_ACQUISITION_CAMPAIGN';
/** The explicit marker for an unrestricted geography scope (budgets still bind it). */
export const WORLDWIDE = 'WORLDWIDE';

/** A window is bounded: at most 30 days (mirrors `acquisition_campaigns_window_chk`). */
export const CAMPAIGN_MAX_WINDOW_SECONDS = 30 * 24 * 60 * 60;
export const CAMPAIGN_MAX_ISSUANCE_SKEW_SECONDS = 300;
export const CAMPAIGN_PAYLOAD_MAX_BYTES = 128 * 1024;
export const CAMPAIGN_ENVELOPE_MAX_BYTES = 256 * 1024;
export const CAMPAIGN_PURPOSE_MAX_CHARS = 500;

export const CAMPAIGN_KEY = /^[a-z0-9][a-z0-9-]{2,62}-v[0-9]{1,4}$/;
export const CAMPAIGN_KEY_ID = /^[a-z0-9][a-z0-9-]{2,40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const INSTANT_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ISO_COUNTRY = /^[A-Z]{2}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,5})$/;

/**
 * Mechanical safety bounds per budget (inclusive), mirrored by
 * `acquisition_campaigns_budgets_chk`. NOT calibrated targets: they cap what
 * any one signed document can ask for (ADR 0029 s5).
 */
export const BUDGET_BOUNDS = Object.freeze({
  maxWorkItems: [1, 10000],
  maxSearchRuns: [0, 100],
  maxResearchRoots: [0, 500],
  maxGatewayRequests: [0, 30000],
  maxItemsPerRegistrableDomain: [1, 100],
  maxConcurrency: [1, 4],
  maxAttemptsPerItem: [1, 10],
  maxAwaitingHumanBacklog: [1, 1000],
} as const);
export type BudgetName = keyof typeof BUDGET_BOUNDS;
export const BUDGET_NAMES = Object.keys(BUDGET_BOUNDS).sort() as BudgetName[];

export type CampaignBudgets = { readonly [K in BudgetName]: number };

export interface CampaignScope {
  /** ISO-3166-1 alpha-2 codes, or exactly `[WORLDWIDE]`. */
  readonly geographies: readonly string[];
  readonly searchGrantIds: readonly string[];
  readonly sourceKinds: readonly SourceKind[];
  /** The stages the worker may perform. Never the human gate. */
  readonly stages: readonly WorkerStage[];
  /**
   * WW H-ACQ: how many LINK_OUT generations the worker may enqueue - signed
   * in a v2 document, exactly 1 for a v1 document. 0 = no link-out root.
   */
  readonly linkOutMaxHops: number;
  /**
   * R2: the signed continuation of a v3 document, or null (v1/v2). The ORDER
   * of `nominationIds` is the OWNER's priority (first = highest). Optional
   * in the type so v1/v2 scope literals stay valid; absent means null.
   */
  readonly continuation?: CampaignContinuation | null;
}

export interface CampaignContinuation {
  readonly predecessorCampaignId: string;
  readonly nominationIds: readonly string[];
}

export interface CampaignPayload {
  readonly action: typeof CAMPAIGN_ACTION;
  readonly budgets: CampaignBudgets;
  readonly campaignKey: string;
  readonly contractVersion: typeof CAMPAIGN_CONTRACT_VERSION;
  readonly document: CampaignDocumentVersion;
  readonly environmentId: string;
  readonly issuedAt: string;
  readonly keyFingerprint: string;
  readonly keyId: string;
  readonly nonce: string;
  readonly protocol: typeof CAMPAIGN_PROTOCOL;
  readonly purpose: string;
  readonly scope: CampaignScope;
  readonly window: { readonly startsAt: string; readonly endsAt: string };
}

export interface CampaignEnvelopeDocument {
  readonly keyId: string;
  readonly payload: string;
  readonly protocol: typeof CAMPAIGN_PROTOCOL;
  readonly signature: string;
}

export type CampaignProtocolCode =
  | 'ENVELOPE_MALFORMED'
  | 'ENVELOPE_TOO_LARGE'
  | 'ENVELOPE_PROTOCOL_MISMATCH'
  | 'KEY_UNKNOWN'
  | 'KEY_FINGERPRINT_MISMATCH'
  | 'KEY_RETIRED'
  | 'KEY_REVOKED'
  | 'PAYLOAD_SIZE'
  | 'PAYLOAD_ENCODING_INVALID'
  | 'SIGNATURE_MALFORMED'
  | 'SIGNATURE_INVALID'
  | 'PAYLOAD_NOT_CANONICAL'
  | 'PAYLOAD_SCHEMA_INVALID'
  | 'PAYLOAD_PROTOCOL_MISMATCH'
  | 'PAYLOAD_KEY_MISMATCH'
  | 'ACTION_AUDIENCE_MISMATCH'
  | 'SCOPE_INVALID'
  | 'BUDGET_INVALID'
  | 'WINDOW_INVALID';

/** A campaign protocol refusal. `detail` is a fixed token: never key material, never a payload value. */
export class CampaignProtocolError extends Error {
  constructor(
    readonly code: CampaignProtocolCode,
    readonly detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'CampaignProtocolError';
  }
}

/** The exact bytes a campaign signature covers. */
export function campaignSigningBytes(payloadBytes: Uint8Array): Buffer {
  return Buffer.concat([Buffer.from(CAMPAIGN_SIGNING_PREFIX, 'utf8'), payloadBytes]);
}

/** Canonical unpadded base64url, or a refusal with `code`. */
export function decodeBase64urlStrict(text: unknown, code: CampaignProtocolCode): Buffer {
  if (typeof text !== 'string' || text.length === 0 || !BASE64URL.test(text)) {
    throw new CampaignProtocolError(code, 'not_base64url');
  }
  const bytes = Buffer.from(text, 'base64url');
  if (bytes.toString('base64url') !== text) {
    throw new CampaignProtocolError(code, 'not_canonical_base64url');
  }
  return bytes;
}

/** Milliseconds of an ISO-8601 ms UTC instant, or a refusal. */
export function instantMsOf(value: unknown, code: CampaignProtocolCode, what: string): number {
  if (typeof value !== 'string' || !INSTANT_MS.test(value)) {
    throw new CampaignProtocolError(code, `${what}_invalid`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms) || new Date(ms).toISOString() !== value) {
    throw new CampaignProtocolError(code, `${what}_invalid`);
  }
  return ms;
}

function object(
  value: unknown,
  keys: readonly string[],
  code: CampaignProtocolCode,
  what: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CampaignProtocolError(code, `${what}_not_object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((k, i) => k !== expected[i])) {
    throw new CampaignProtocolError(code, `${what}_fields`);
  }
  return value as Record<string, unknown>;
}

function str(value: unknown, pattern: RegExp, code: CampaignProtocolCode, what: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new CampaignProtocolError(code, `${what}_invalid`);
  }
  return value;
}

function list(
  value: unknown,
  accept: (v: unknown) => boolean,
  bounds: readonly [number, number],
  code: CampaignProtocolCode,
  what: string,
): string[] {
  if (!Array.isArray(value) || value.length < bounds[0] || value.length > bounds[1]) {
    throw new CampaignProtocolError(code, `${what}_size`);
  }
  if (!value.every(accept)) throw new CampaignProtocolError(code, `${what}_value`);
  if (new Set(value).size !== value.length) {
    throw new CampaignProtocolError(code, `${what}_duplicate`);
  }
  return value as string[];
}

const PAYLOAD_KEYS = [
  'action',
  'budgets',
  'campaignKey',
  'contractVersion',
  'document',
  'environmentId',
  'issuedAt',
  'keyFingerprint',
  'keyId',
  'nonce',
  'protocol',
  'purpose',
  'scope',
  'window',
];

function parseContinuation(value: unknown): CampaignContinuation {
  const o = object(
    value,
    ['nominationIds', 'predecessorCampaignId'],
    'SCOPE_INVALID',
    'continuation',
  );
  const predecessorCampaignId = str(
    o['predecessorCampaignId'],
    UUID,
    'SCOPE_INVALID',
    'continuation_predecessor_campaign_id',
  );
  const nominationIds = list(
    o['nominationIds'],
    (v) => typeof v === 'string' && UUID.test(v),
    [1, CAMPAIGN_CONTINUATION_MAX_NOMINATIONS],
    'SCOPE_INVALID',
    'continuation_nomination_ids',
  );
  return { predecessorCampaignId, nominationIds };
}

function parseScope(value: unknown, version: CampaignDocumentVersion): CampaignScope {
  const o = object(
    value,
    version === CAMPAIGN_DOCUMENT_VERSION_V3
      ? ['continuation', 'geographies', 'linkOutMaxHops', 'searchGrantIds', 'sourceKinds', 'stages']
      : version === CAMPAIGN_DOCUMENT_VERSION_V2
        ? ['geographies', 'linkOutMaxHops', 'searchGrantIds', 'sourceKinds', 'stages']
        : ['geographies', 'searchGrantIds', 'sourceKinds', 'stages'],
    'SCOPE_INVALID',
    'scope',
  );
  let linkOutMaxHops: number = CAMPAIGN_V1_LINK_OUT_MAX_HOPS;
  if (version !== CAMPAIGN_DOCUMENT_VERSION) {
    const raw = o['linkOutMaxHops'];
    if (typeof raw !== 'string' || !DECIMAL.test(raw)) {
      throw new CampaignProtocolError('SCOPE_INVALID', 'link_out_max_hops_not_decimal');
    }
    linkOutMaxHops = Number(raw);
    const [lo, hi] = CAMPAIGN_LINK_OUT_MAX_HOPS_BOUNDS;
    if (linkOutMaxHops < lo || linkOutMaxHops > hi) {
      throw new CampaignProtocolError('SCOPE_INVALID', 'link_out_max_hops_out_of_bounds');
    }
  }
  const geographies = list(
    o['geographies'],
    (v) => v === WORLDWIDE || (typeof v === 'string' && ISO_COUNTRY.test(v)),
    [1, 64],
    'SCOPE_INVALID',
    'geographies',
  );
  if (geographies.includes(WORLDWIDE) && geographies.length !== 1) {
    throw new CampaignProtocolError('SCOPE_INVALID', 'worldwide_not_alone');
  }
  const sourceKinds = list(
    o['sourceKinds'],
    (v) => (SOURCE_KINDS as readonly unknown[]).includes(v),
    [1, 3],
    'SCOPE_INVALID',
    'source_kinds',
  ) as SourceKind[];
  const stages = list(
    o['stages'],
    (v) => (WORKER_STAGES as readonly unknown[]).includes(v),
    [1, WORKER_STAGES.length],
    'SCOPE_INVALID',
    'stages',
  ) as WorkerStage[];
  const searchGrantIds = list(
    o['searchGrantIds'],
    (v) => typeof v === 'string' && UUID.test(v),
    [0, 64],
    'SCOPE_INVALID',
    'search_grant_ids',
  );
  if (sourceKinds.includes('SEARCH_GRANT') !== searchGrantIds.length > 0) {
    throw new CampaignProtocolError('SCOPE_INVALID', 'search_grants_vs_source_kind');
  }
  let continuation: CampaignContinuation | null = null;
  if (version === CAMPAIGN_DOCUMENT_VERSION_V3) {
    continuation = parseContinuation(o['continuation']);
    // The adopted items keep their SEARCH_GRANT source kind (migration 0029).
    if (!sourceKinds.includes('SEARCH_GRANT')) {
      throw new CampaignProtocolError('SCOPE_INVALID', 'continuation_requires_search_grant');
    }
  }
  return { geographies, searchGrantIds, sourceKinds, stages, linkOutMaxHops, continuation };
}

function parseBudgets(value: unknown): CampaignBudgets {
  const o = object(value, BUDGET_NAMES, 'BUDGET_INVALID', 'budgets');
  const out: Partial<Record<BudgetName, number>> = {};
  for (const name of BUDGET_NAMES) {
    const raw = o[name];
    if (typeof raw !== 'string' || !DECIMAL.test(raw)) {
      throw new CampaignProtocolError('BUDGET_INVALID', `${name}_not_decimal`);
    }
    const n = Number(raw);
    const [lo, hi] = BUDGET_BOUNDS[name];
    if (n < lo || n > hi)
      throw new CampaignProtocolError('BUDGET_INVALID', `${name}_out_of_bounds`);
    out[name] = n;
  }
  return out as CampaignBudgets;
}

/**
 * Parses and validates the SIGNED payload's JSON value. Called only on bytes
 * whose signature already verified (verify.ts) - or by tests.
 */
export function parseCampaignPayload(value: unknown): CampaignPayload {
  const o = object(value, PAYLOAD_KEYS, 'PAYLOAD_SCHEMA_INVALID', 'payload');
  if (o['protocol'] !== CAMPAIGN_PROTOCOL) {
    throw new CampaignProtocolError('PAYLOAD_PROTOCOL_MISMATCH', 'protocol');
  }
  const document = o['document'];
  if (!(CAMPAIGN_DOCUMENT_VERSIONS as readonly unknown[]).includes(document)) {
    throw new CampaignProtocolError('PAYLOAD_SCHEMA_INVALID', 'document_version');
  }
  if (o['contractVersion'] !== CAMPAIGN_CONTRACT_VERSION) {
    throw new CampaignProtocolError('PAYLOAD_SCHEMA_INVALID', 'contract_version');
  }
  if (o['action'] !== CAMPAIGN_ACTION) {
    throw new CampaignProtocolError('ACTION_AUDIENCE_MISMATCH', 'action');
  }
  const purpose = o['purpose'];
  if (typeof purpose !== 'string' || !isAdmissibleText(purpose, CAMPAIGN_PURPOSE_MAX_CHARS)) {
    throw new CampaignProtocolError('PAYLOAD_SCHEMA_INVALID', 'purpose_invalid');
  }
  const w = object(o['window'], ['endsAt', 'startsAt'], 'WINDOW_INVALID', 'window');
  const startsMs = instantMsOf(w['startsAt'], 'WINDOW_INVALID', 'starts_at');
  const endsMs = instantMsOf(w['endsAt'], 'WINDOW_INVALID', 'ends_at');
  if (!(endsMs > startsMs) || endsMs - startsMs > CAMPAIGN_MAX_WINDOW_SECONDS * 1000) {
    throw new CampaignProtocolError('WINDOW_INVALID', 'window_out_of_bounds');
  }
  instantMsOf(o['issuedAt'], 'PAYLOAD_SCHEMA_INVALID', 'issued_at');
  return {
    action: CAMPAIGN_ACTION,
    budgets: parseBudgets(o['budgets']),
    campaignKey: str(o['campaignKey'], CAMPAIGN_KEY, 'PAYLOAD_SCHEMA_INVALID', 'campaign_key'),
    contractVersion: CAMPAIGN_CONTRACT_VERSION,
    document: document as CampaignDocumentVersion,
    environmentId: str(o['environmentId'], UUID, 'PAYLOAD_SCHEMA_INVALID', 'environment_id'),
    issuedAt: o['issuedAt'] as string,
    keyFingerprint: str(o['keyFingerprint'], HEX64, 'PAYLOAD_SCHEMA_INVALID', 'key_fingerprint'),
    keyId: str(o['keyId'], CAMPAIGN_KEY_ID, 'PAYLOAD_SCHEMA_INVALID', 'key_id'),
    nonce: str(o['nonce'], NONCE, 'PAYLOAD_SCHEMA_INVALID', 'nonce'),
    protocol: CAMPAIGN_PROTOCOL,
    purpose,
    scope: parseScope(o['scope'], document as CampaignDocumentVersion),
    window: { startsAt: w['startsAt'] as string, endsAt: w['endsAt'] as string },
  };
}

/** An envelope document's four fields, without decoding or verifying anything. */
export function parseCampaignEnvelopeDocument(value: unknown): CampaignEnvelopeDocument {
  const o = object(
    value,
    ['keyId', 'payload', 'protocol', 'signature'],
    'ENVELOPE_MALFORMED',
    'envelope',
  );
  if (o['protocol'] !== CAMPAIGN_PROTOCOL) {
    throw new CampaignProtocolError('ENVELOPE_PROTOCOL_MISMATCH', 'protocol_mismatch');
  }
  return {
    protocol: CAMPAIGN_PROTOCOL,
    keyId: str(o['keyId'], CAMPAIGN_KEY_ID, 'ENVELOPE_MALFORMED', 'key_id'),
    payload: str(o['payload'], BASE64URL, 'ENVELOPE_MALFORMED', 'payload'),
    signature: str(o['signature'], BASE64URL, 'ENVELOPE_MALFORMED', 'signature'),
  };
}

/** The campaign payload as a canonical value (budgets back to decimal strings). */
export function campaignPayloadValue(payload: CampaignPayload): CanonicalValue {
  const budgets: Record<string, string> = {};
  for (const name of BUDGET_NAMES) budgets[name] = String(payload.budgets[name]);
  return {
    action: payload.action,
    budgets,
    campaignKey: payload.campaignKey,
    contractVersion: payload.contractVersion,
    document: payload.document,
    environmentId: payload.environmentId,
    issuedAt: payload.issuedAt,
    keyFingerprint: payload.keyFingerprint,
    keyId: payload.keyId,
    nonce: payload.nonce,
    protocol: payload.protocol,
    purpose: payload.purpose,
    scope: {
      // v3 only: the signed continuation, its nomination order preserved.
      ...(payload.document === CAMPAIGN_DOCUMENT_VERSION_V3 && payload.scope.continuation != null
        ? {
            continuation: {
              nominationIds: [...payload.scope.continuation.nominationIds],
              predecessorCampaignId: payload.scope.continuation.predecessorCampaignId,
            },
          }
        : {}),
      geographies: [...payload.scope.geographies],
      // v2/v3 only: a v1 document carries no depth (it means exactly 1).
      ...(payload.document !== CAMPAIGN_DOCUMENT_VERSION
        ? { linkOutMaxHops: String(payload.scope.linkOutMaxHops) }
        : {}),
      searchGrantIds: [...payload.scope.searchGrantIds],
      sourceKinds: [...payload.scope.sourceKinds],
      stages: [...payload.scope.stages],
    },
    window: { endsAt: payload.window.endsAt, startsAt: payload.window.startsAt },
  };
}

/** The canonical bytes of a campaign payload (what is signed). */
export function campaignPayloadBytes(payload: CampaignPayload): Buffer {
  return canonicalBytes(campaignPayloadValue(payload));
}

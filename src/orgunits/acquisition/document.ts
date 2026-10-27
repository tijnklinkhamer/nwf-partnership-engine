/**
 * WW E-Q - THE OWNER-SIGNED ACQUISITION CAMPAIGN DOCUMENT
 * (`nwf-pe.acquisition-campaign.v1`, protocol `nwf-pe.acquisition-campaign/1`).
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
}

export interface CampaignPayload {
  readonly action: typeof CAMPAIGN_ACTION;
  readonly budgets: CampaignBudgets;
  readonly campaignKey: string;
  readonly contractVersion: typeof CAMPAIGN_CONTRACT_VERSION;
  readonly document: typeof CAMPAIGN_DOCUMENT_VERSION;
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

function parseScope(value: unknown): CampaignScope {
  const o = object(
    value,
    ['geographies', 'searchGrantIds', 'sourceKinds', 'stages'],
    'SCOPE_INVALID',
    'scope',
  );
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
  return { geographies, searchGrantIds, sourceKinds, stages };
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
  if (o['document'] !== CAMPAIGN_DOCUMENT_VERSION) {
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
    document: CAMPAIGN_DOCUMENT_VERSION,
    environmentId: str(o['environmentId'], UUID, 'PAYLOAD_SCHEMA_INVALID', 'environment_id'),
    issuedAt: o['issuedAt'] as string,
    keyFingerprint: str(o['keyFingerprint'], HEX64, 'PAYLOAD_SCHEMA_INVALID', 'key_fingerprint'),
    keyId: str(o['keyId'], CAMPAIGN_KEY_ID, 'PAYLOAD_SCHEMA_INVALID', 'key_id'),
    nonce: str(o['nonce'], NONCE, 'PAYLOAD_SCHEMA_INVALID', 'nonce'),
    protocol: CAMPAIGN_PROTOCOL,
    purpose,
    scope: parseScope(o['scope']),
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
      geographies: [...payload.scope.geographies],
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

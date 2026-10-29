/**
 * WW E-Q - CAMPAIGN AUTHORITY: recording a signed campaign and its control
 * events on the OWNER path, and deriving the in-process `CampaignAuthority`
 * capability the worker needs before EVERY claim (ADR 0029 s3).
 *
 * THE AUTHORITY IS THE OWNER SIGNATURE, NOT THE ROW. A stored campaign counts
 * only if, at the moment of use:
 *   - its stored signature verifies, signature first, under the PINNED
 *     campaign trust set (empty in this build: nothing verifies);
 *   - the signed payload is byte-identical to the stored one and names this
 *     database's environment;
 *   - its key is still authoritative for the instant it was recorded
 *     (REVOKED stops every campaign it signed at once);
 *   - its derived control state is RUNNING;
 *   - the DATABASE clock is inside its window.
 *
 * `CampaignAuthority` is sealed (private `#sealed` brand) and its constructor
 * refuses any call without this module's unexported mint symbol, so the ONE
 * way to hold one is `deriveCampaignAuthority`. It is a CARRIER: the database
 * re-checks control state, window, stage scope and concurrency on every claim
 * INSERT (migration 0023), whatever a caller holds.
 *
 * Only the owner path can record a campaign or a control event: migration
 * 0023 grants INSERT on neither to any runtime role. The worker reads both.
 *
 * Opens no socket. Never UPDATEs or DELETEs.
 */
import type pg from 'pg';

import {
  CampaignProtocolError,
  CAMPAIGN_MAX_ISSUANCE_SKEW_SECONDS,
  type CampaignBudgets,
  type CampaignPayload,
  type CampaignScope,
} from './document.js';
import { CampaignTrustSet } from './trust.js';
import { VerifiedCampaignEnvelope, verifySignedCampaignPayload } from './verify.js';
import {
  ACTOR_KEY,
  CONTROL_ACTIONS,
  UUID,
  type ControlAction,
  type ControlState,
} from './vocabulary.js';

type Queryable = pg.Pool | pg.PoolClient;

const MINT: unique symbol = Symbol('CampaignAuthority.mint');

export type CampaignAuthorityRefusalCode =
  | 'CAMPAIGN_NOT_FOUND'
  | 'CAMPAIGN_UNVERIFIED'
  | 'CAMPAIGN_NOT_STARTED'
  | 'CAMPAIGN_PAUSED'
  | 'CAMPAIGN_STOPPED'
  | 'CAMPAIGN_EMERGENCY_STOPPED'
  | 'CAMPAIGN_WINDOW_NOT_OPEN'
  | 'CAMPAIGN_WINDOW_CLOSED';

interface AuthorityFields {
  readonly campaignId: string;
  readonly campaignKey: string;
  readonly environmentId: string;
  readonly keyId: string;
  readonly payloadSha256: string;
  readonly scope: CampaignScope;
  readonly budgets: CampaignBudgets;
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  readonly derivedAtMs: number;
  readonly trustScope: 'OPERATIONAL' | 'TEST_ONLY';
}

/** The verified, RUNNING, in-window campaign a worker may claim under - right now. */
export class CampaignAuthority {
  readonly #sealed = true;
  readonly campaignId: string;
  readonly campaignKey: string;
  readonly environmentId: string;
  readonly keyId: string;
  readonly payloadSha256: string;
  /** From the SIGNED payload, never from a column or a caller. */
  readonly scope: CampaignScope;
  readonly budgets: CampaignBudgets;
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  /** The database clock when this authority was derived. */
  readonly derivedAtMs: number;
  readonly trustScope: 'OPERATIONAL' | 'TEST_ONLY';

  private constructor(mint: symbol, fields: AuthorityFields) {
    if (mint !== MINT) {
      throw new Error(
        'CampaignAuthority cannot be constructed directly: it is derived only from a stored, ' +
          'OWNER-signed campaign by deriveCampaignAuthority (ADR 0029).',
      );
    }
    this.campaignId = fields.campaignId;
    this.campaignKey = fields.campaignKey;
    this.environmentId = fields.environmentId;
    this.keyId = fields.keyId;
    this.payloadSha256 = fields.payloadSha256;
    this.scope = Object.freeze({
      geographies: Object.freeze([...fields.scope.geographies]),
      searchGrantIds: Object.freeze([...fields.scope.searchGrantIds]),
      sourceKinds: Object.freeze([...fields.scope.sourceKinds]),
      stages: Object.freeze([...fields.scope.stages]),
      linkOutMaxHops: fields.scope.linkOutMaxHops,
      continuation:
        fields.scope.continuation == null
          ? null
          : Object.freeze({
              predecessorCampaignId: fields.scope.continuation.predecessorCampaignId,
              nominationIds: Object.freeze([...fields.scope.continuation.nominationIds]),
            }),
    });
    this.budgets = Object.freeze({ ...fields.budgets });
    this.startsAtMs = fields.startsAtMs;
    this.endsAtMs = fields.endsAtMs;
    this.derivedAtMs = fields.derivedAtMs;
    this.trustScope = fields.trustScope;
    Object.freeze(this);
  }

  static isAuthority(value: unknown): value is CampaignAuthority {
    return typeof value === 'object' && value !== null && #sealed in value;
  }

  /** @internal Minted only by deriveCampaignAuthority below. */
  static mint(fields: AuthorityFields, token: symbol): CampaignAuthority {
    return new CampaignAuthority(token, fields);
  }
}

/** One stored campaign row, with the database's own view of now and its control state. */
export interface StoredCampaign {
  readonly id: string;
  readonly campaignKey: string;
  readonly environmentId: string;
  readonly keyId: string;
  readonly payloadBase64url: string;
  readonly payloadSha256: string;
  readonly signature: string;
  readonly startsAtMs: number;
  readonly endsAtMs: number;
  readonly recordedAtMs: number;
  readonly allowedStages: readonly string[];
  readonly sourceKinds: readonly string[];
  readonly controlState: ControlState;
  readonly databaseEnvironmentId: string | null;
  readonly nowMs: number;
}

interface CampaignRow {
  id: string;
  campaign_key: string;
  environment_id: string;
  key_id: string;
  payload_base64url: string;
  payload_sha256: string;
  signature: string;
  starts_at: Date;
  ends_at: Date;
  recorded_at: Date;
  allowed_stages: string[];
  source_kinds: string[];
  control_state: ControlState;
  database_environment_id: string | null;
  now: Date;
}

/** Reads one campaign, its derived control state and the database clock in one statement. */
export async function loadStoredCampaign(
  q: Queryable,
  campaignId: string,
): Promise<StoredCampaign | null> {
  if (!UUID.test(campaignId)) return null;
  const { rows } = await q.query<CampaignRow>(
    `SELECT c.id, c.campaign_key, c.environment_id, c.key_id, c.payload_base64url,
            c.payload_sha256, c.signature, c.starts_at, c.ends_at, c.recorded_at,
            c.allowed_stages, c.source_kinds,
            acquisition_campaign_control_state(c.id) AS control_state,
            -- THIS database's own environment record (migration 0015's one
            -- row), read independently of the campaign row: a campaign whose
            -- environment is not this database's never verifies. Migration
            -- 0024 grants the worker SELECT on it. A CLONED database keeps the
            -- environment id, so a clone can replay a campaign (ADR 0030 s9).
            (SELECT CASE WHEN count(*) = 1 THEN max(environment_id::text) END
               FROM subject_review_environment) AS database_environment_id,
            now() AS now
       FROM acquisition_campaigns c
      WHERE c.id = $1`,
    [campaignId],
  );
  const r = rows[0];
  if (r === undefined) return null;
  return {
    id: r.id,
    campaignKey: r.campaign_key,
    environmentId: r.environment_id,
    keyId: r.key_id,
    payloadBase64url: r.payload_base64url,
    payloadSha256: r.payload_sha256,
    signature: r.signature,
    startsAtMs: r.starts_at.getTime(),
    endsAtMs: r.ends_at.getTime(),
    recordedAtMs: r.recorded_at.getTime(),
    allowedStages: r.allowed_stages,
    sourceKinds: r.source_kinds,
    controlState: r.control_state,
    databaseEnvironmentId: r.database_environment_id,
    nowMs: r.now.getTime(),
  };
}

export type StoredVerification =
  | { readonly ok: true; readonly payload: CampaignPayload }
  | { readonly ok: false; readonly detail: string };

/**
 * Re-verifies a STORED campaign, signature first, under `trust`: the payload
 * the row holds must verify, hash to the stored digest, name this database's
 * environment, and its key must still be authority for the recording instant.
 */
export function verifyStoredCampaign(
  stored: StoredCampaign,
  trust: CampaignTrustSet,
): StoredVerification {
  let check;
  try {
    check = verifySignedCampaignPayload(
      stored.keyId,
      stored.payloadBase64url,
      stored.signature,
      trust,
    );
  } catch (error) {
    if (error instanceof CampaignProtocolError) return { ok: false, detail: error.code };
    throw error;
  }
  if (check.payloadSha256 !== stored.payloadSha256) return { ok: false, detail: 'PAYLOAD_DIGEST' };
  if (
    check.payload.environmentId !== stored.environmentId ||
    stored.environmentId !== stored.databaseEnvironmentId
  ) {
    return { ok: false, detail: 'ENVIRONMENT_MISMATCH' };
  }
  if (check.payload.campaignKey !== stored.campaignKey)
    return { ok: false, detail: 'CAMPAIGN_KEY' };
  if (!check.trusted.authoritativeFor(stored.recordedAtMs)) {
    return { ok: false, detail: 'KEY_NOT_AUTHORITATIVE' };
  }
  return { ok: true, payload: check.payload };
}

export type CampaignAuthorityResult =
  | { readonly ok: true; readonly authority: CampaignAuthority }
  | {
      readonly ok: false;
      readonly code: CampaignAuthorityRefusalCode;
      readonly detail: string | null;
    };

export interface CampaignAuthorityDeps {
  /** Omitted: the operational trust set (EMPTY). Tests pass a TEST_ONLY set (vitest only). */
  readonly trust?: CampaignTrustSet;
}

/**
 * THE ONE PRODUCTION DERIVATION of a `CampaignAuthority`. Reads the stored
 * row as the caller's role, re-verifies it, then checks control state and the
 * window by the DATABASE clock. Never throws for a refusal: the worker turns
 * each refusal code into a recorded stop reason.
 */
export async function deriveCampaignAuthority(
  q: Queryable,
  campaignId: string,
  deps: CampaignAuthorityDeps = {},
): Promise<CampaignAuthorityResult> {
  const trust = deps.trust ?? CampaignTrustSet.operational();
  const stored = await loadStoredCampaign(q, campaignId);
  if (stored === null) return { ok: false, code: 'CAMPAIGN_NOT_FOUND', detail: null };
  const verified = verifyStoredCampaign(stored, trust);
  if (!verified.ok) return { ok: false, code: 'CAMPAIGN_UNVERIFIED', detail: verified.detail };
  const stateRefusal: Partial<Record<ControlState, CampaignAuthorityRefusalCode>> = {
    NOT_STARTED: 'CAMPAIGN_NOT_STARTED',
    PAUSED: 'CAMPAIGN_PAUSED',
    STOPPED: 'CAMPAIGN_STOPPED',
    EMERGENCY_STOPPED: 'CAMPAIGN_EMERGENCY_STOPPED',
  };
  const refused = stateRefusal[stored.controlState];
  if (refused !== undefined) return { ok: false, code: refused, detail: null };
  if (stored.nowMs < stored.startsAtMs) {
    return { ok: false, code: 'CAMPAIGN_WINDOW_NOT_OPEN', detail: null };
  }
  if (stored.nowMs >= stored.endsAtMs) {
    return { ok: false, code: 'CAMPAIGN_WINDOW_CLOSED', detail: null };
  }
  const p = verified.payload;
  return {
    ok: true,
    authority: CampaignAuthority.mint(
      {
        campaignId: stored.id,
        campaignKey: p.campaignKey,
        environmentId: p.environmentId,
        keyId: p.keyId,
        payloadSha256: stored.payloadSha256,
        scope: p.scope,
        budgets: p.budgets,
        startsAtMs: Date.parse(p.window.startsAt),
        endsAtMs: Date.parse(p.window.endsAt),
        derivedAtMs: stored.nowMs,
        trustScope: trust.scope,
      },
      MINT,
    ),
  };
}

// ---------------------------------------------------------------------------
// The owner path: recording a campaign and its control events.
// ---------------------------------------------------------------------------

export type CampaignRecordRefusalCode =
  | 'ENVELOPE_INVALID'
  | 'OWNER_PATH_REQUIRED'
  | 'ACTOR_KEY_INVALID'
  | 'KEY_NOT_ACTIVE'
  | 'ENVIRONMENT_MISMATCH'
  | 'ISSUED_IN_FUTURE'
  | 'WINDOW_CLOSED'
  | 'NONCE_REUSED'
  | 'CAMPAIGN_KEY_IN_USE'
  | 'CAMPAIGN_NOT_FOUND'
  | 'CAMPAIGN_UNVERIFIED'
  | 'CONTROL_TRANSITION_REFUSED'
  | 'CONTINUATION_INVALID'
  | 'REQUEST_INVALID';

/** A refusal on the owner path. Nothing was written. `detail` is a fixed token. */
export class CampaignRecordRefusal extends Error {
  constructor(
    readonly code: CampaignRecordRefusalCode,
    readonly detail: string | null = null,
  ) {
    super(detail === null ? code : `${code}: ${detail}`);
    this.name = 'CampaignRecordRefusal';
  }
}

async function assertOwnerPath(client: pg.PoolClient): Promise<void> {
  const { rows } = await client.query<{ owner: boolean }>(
    'SELECT acquisition_is_owner_path() AS owner',
  );
  if (rows[0]?.owner !== true) throw new CampaignRecordRefusal('OWNER_PATH_REQUIRED');
}

export interface RecordCampaignResult {
  readonly outcome: 'RECORDED' | 'ALREADY_RECORDED';
  readonly campaignId: string;
  readonly campaignKey: string;
  readonly payloadSha256: string;
}

/**
 * Verifies one signed envelope and appends it as a campaign, on the owner
 * path. Idempotent on the payload digest. A campaign is recorded NOT_STARTED;
 * START is a separate control event.
 */
export async function recordCampaign(
  ownerPool: pg.Pool,
  envelopeBytes: Uint8Array,
  input: { readonly actorKey: string },
  deps: CampaignAuthorityDeps = {},
): Promise<RecordCampaignResult> {
  if (!ACTOR_KEY.test(input.actorKey)) throw new CampaignRecordRefusal('ACTOR_KEY_INVALID');
  const trust = deps.trust ?? CampaignTrustSet.operational();
  let verified: VerifiedCampaignEnvelope;
  try {
    verified = VerifiedCampaignEnvelope.verify(envelopeBytes, trust);
  } catch (error) {
    if (error instanceof CampaignProtocolError) {
      throw new CampaignRecordRefusal('ENVELOPE_INVALID', error.code);
    }
    throw error;
  }
  const p = verified.payload;
  const client = await ownerPool.connect();
  try {
    await client.query('BEGIN');
    await assertOwnerPath(client);
    const { rows: clock } = await client.query<{ now: Date; env: string | null }>(
      'SELECT now() AS now, (SELECT environment_id FROM subject_review_environment) AS env',
    );
    const nowMs = clock[0]!.now.getTime();
    const decision = verified.mayDecideAt(nowMs);
    if (decision !== 'OK') throw new CampaignRecordRefusal('KEY_NOT_ACTIVE', decision);
    if (clock[0]!.env !== p.environmentId) {
      throw new CampaignRecordRefusal('ENVIRONMENT_MISMATCH');
    }
    if (Date.parse(p.issuedAt) > nowMs + CAMPAIGN_MAX_ISSUANCE_SKEW_SECONDS * 1000) {
      throw new CampaignRecordRefusal('ISSUED_IN_FUTURE');
    }
    if (Date.parse(p.window.endsAt) <= nowMs) throw new CampaignRecordRefusal('WINDOW_CLOSED');

    const existing = await client.query<{ id: string }>(
      'SELECT id FROM acquisition_campaigns WHERE payload_sha256 = $1',
      [verified.payloadSha256],
    );
    if (existing.rows[0] !== undefined) {
      await client.query('ROLLBACK');
      return {
        outcome: 'ALREADY_RECORDED',
        campaignId: existing.rows[0].id,
        campaignKey: p.campaignKey,
        payloadSha256: verified.payloadSha256,
      };
    }
    // R2 (migration 0029): a v3 continuation names another campaign of THIS
    // environment (the database re-checks it on insert).
    const continuation = p.scope.continuation ?? null;
    if (continuation !== null) {
      const { rows: pred } = await client.query<{ env: string }>(
        'SELECT environment_id AS env FROM acquisition_campaigns WHERE id = $1',
        [continuation.predecessorCampaignId],
      );
      if (pred[0] === undefined || pred[0].env !== p.environmentId) {
        throw new CampaignRecordRefusal('CONTINUATION_INVALID', 'predecessor_unknown');
      }
    }
    let inserted;
    try {
      inserted = await client.query<{ id: string }>(
        `INSERT INTO acquisition_campaigns
           (environment_id, campaign_key, document_version, document, payload_base64url,
            payload_sha256, signature, key_id, key_fingerprint, nonce, issued_at, starts_at,
            ends_at, geographies, source_kinds, allowed_stages, search_grant_ids,
            max_work_items, max_search_runs, max_research_roots, max_gateway_requests,
            max_items_per_registrable_domain, max_concurrency, max_attempts_per_item,
            max_awaiting_human_backlog, actor_key, link_out_max_hops)
         VALUES ($1, $2, $3, convert_from(decode($4, 'base64'), 'UTF8')::jsonb, $5, $6, $7, $8,
                 $9, $10, $11, $12, $13, $14, $15, $16, $17::uuid[], $18, $19, $20, $21, $22,
                 $23, $24, $25, $26, $27)
         RETURNING id`,
        [
          p.environmentId,
          p.campaignKey,
          p.document,
          Buffer.from(verified.signedPayload, 'base64url').toString('base64'),
          verified.signedPayload,
          verified.payloadSha256,
          verified.signature,
          verified.keyId,
          verified.keyFingerprint,
          p.nonce,
          p.issuedAt,
          p.window.startsAt,
          p.window.endsAt,
          [...p.scope.geographies],
          [...p.scope.sourceKinds],
          [...p.scope.stages],
          [...p.scope.searchGrantIds],
          p.budgets.maxWorkItems,
          p.budgets.maxSearchRuns,
          p.budgets.maxResearchRoots,
          p.budgets.maxGatewayRequests,
          p.budgets.maxItemsPerRegistrableDomain,
          p.budgets.maxConcurrency,
          p.budgets.maxAttemptsPerItem,
          p.budgets.maxAwaitingHumanBacklog,
          input.actorKey,
          p.scope.linkOutMaxHops,
        ],
      );
    } catch (error) {
      const constraint = (error as { constraint?: string }).constraint;
      if (constraint === 'acquisition_campaigns_nonce_uidx') {
        throw new CampaignRecordRefusal('NONCE_REUSED');
      }
      if (constraint === 'acquisition_campaigns_key_uidx') {
        throw new CampaignRecordRefusal('CAMPAIGN_KEY_IN_USE');
      }
      throw error;
    }
    await client.query('COMMIT');
    return {
      outcome: 'RECORDED',
      campaignId: inserted.rows[0]!.id,
      campaignKey: p.campaignKey,
      payloadSha256: verified.payloadSha256,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export interface ControlEventRequest {
  readonly campaignId: string;
  readonly action: ControlAction;
  readonly actorKey: string;
  readonly reason?: string | null;
}

export interface ControlEventResult {
  readonly eventId: string;
  readonly sequenceNo: number;
  readonly previousState: ControlState;
  readonly action: ControlAction;
}

/**
 * Appends one control event on the owner path. START and RESUME additionally
 * require the campaign to verify under `trust` (nothing verifies in this
 * build); PAUSE, STOP and EMERGENCY_STOP never do, so a campaign can always
 * be halted. The database decides which transitions are legal.
 */
export async function recordControlEvent(
  ownerPool: pg.Pool,
  request: ControlEventRequest,
  deps: CampaignAuthorityDeps = {},
): Promise<ControlEventResult> {
  // EMERGENCY_STOP takes no advisory lock, so a racing control event can win
  // its sequence number: retry a bounded number of times.
  const tries = request.action === 'EMERGENCY_STOP' ? 5 : 1;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await recordControlEventOnce(ownerPool, request, deps);
    } catch (error) {
      const e = error as { code?: string; message?: string };
      const raced =
        e.code === '23505' || /sequence_no must be the next in order/.test(e.message ?? '');
      if (!raced || attempt >= tries) throw error;
    }
  }
}

async function recordControlEventOnce(
  ownerPool: pg.Pool,
  request: ControlEventRequest,
  deps: CampaignAuthorityDeps,
): Promise<ControlEventResult> {
  if (!UUID.test(request.campaignId))
    throw new CampaignRecordRefusal('REQUEST_INVALID', 'campaign_id');
  if (!(CONTROL_ACTIONS as readonly string[]).includes(request.action)) {
    throw new CampaignRecordRefusal('REQUEST_INVALID', 'action');
  }
  if (!ACTOR_KEY.test(request.actorKey)) throw new CampaignRecordRefusal('ACTOR_KEY_INVALID');
  const trust = deps.trust ?? CampaignTrustSet.operational();
  const client = await ownerPool.connect();
  try {
    await client.query('BEGIN');
    await assertOwnerPath(client);
    // EMERGENCY_STOP never queues behind the campaign advisory lock (any
    // connecting role can take one): its trigger takes a row lock no runtime
    // role can hold instead, and a racing event is retried below.
    if (request.action !== 'EMERGENCY_STOP') {
      await client.query('SELECT pg_advisory_xact_lock(acquisition_campaign_lock_key($1))', [
        request.campaignId,
      ]);
    }
    const stored = await loadStoredCampaign(client, request.campaignId);
    if (stored === null) throw new CampaignRecordRefusal('CAMPAIGN_NOT_FOUND');
    if (request.action === 'START' || request.action === 'RESUME') {
      const verified = verifyStoredCampaign(stored, trust);
      if (!verified.ok) throw new CampaignRecordRefusal('CAMPAIGN_UNVERIFIED', verified.detail);
    }
    const { rows: seq } = await client.query<{ next: number }>(
      `SELECT (COALESCE(max(sequence_no), 0) + 1)::integer AS next
         FROM acquisition_campaign_control_events WHERE campaign_id = $1`,
      [request.campaignId],
    );
    let inserted;
    try {
      inserted = await client.query<{ id: string }>(
        `INSERT INTO acquisition_campaign_control_events
           (campaign_id, sequence_no, action, actor_key, reason)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          request.campaignId,
          seq[0]!.next,
          request.action,
          request.actorKey,
          request.reason ?? null,
        ],
      );
    } catch (error) {
      const message = (error as { message?: string }).message ?? '';
      if (/is not permitted from/.test(message)) {
        throw new CampaignRecordRefusal('CONTROL_TRANSITION_REFUSED', stored.controlState);
      }
      throw error;
    }
    await client.query('COMMIT');
    return {
      eventId: inserted.rows[0]!.id,
      sequenceNo: seq[0]!.next,
      previousState: stored.controlState,
      action: request.action,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

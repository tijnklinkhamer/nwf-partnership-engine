/**
 * WW E-Q - THE APPEND-ONLY QUEUE STORE (migration 0023, ADR 0029 s4).
 *
 * Every write here is an INSERT; every state is DERIVED from rows:
 *
 *   enqueue  - a work item is idempotent per (campaign, stage, subject): a
 *              duplicate is reported, never inserted twice; the campaign's
 *              item budget and per-domain cap are checked under the campaign
 *              lock and again by the database trigger.
 *   claim    - one INSERT into acquisition_work_claims, under the campaign
 *              lock, of the item the pure scheduler chose; the database
 *              refuses a second claim of the same attempt (unique index), a
 *              claim while a lease is live, a claim outside the window, a
 *              claim of a stage the campaign does not list and a claim beyond
 *              the concurrency cap.
 *   outcome  - one INSERT into acquisition_work_outcomes per claim, plus the
 *              children an ADVANCED outcome produced, in ONE transaction: an
 *              outcome is never half-written. At most one terminal outcome
 *              per item (index), so an item is never ADVANCED twice.
 *
 * Budgets are DERIVED: items are counted, and spend is - per claim - what
 * its outcome reported, or its full RESERVATION while it has none (ADR 0030,
 * migration 0024: a claim reserves its stage's spend under the campaign lock,
 * and the database refuses a reservation that does not fit the signed
 * budget). A crashed, expired or superseded claim therefore keeps counting.
 * Nothing is ever UPDATEd or DELETEd.
 *
 * SESSIONS. Every worker write runs in `inWorkerTransaction`, which refuses a
 * superuser or table-owner session, requires the login to hold
 * `nwf_acquisition_worker` and narrows to exactly that capability with
 * `SET LOCAL ROLE` (the source-discovery store's pattern). Owner-path writes
 * (`enqueueOwnerRoot`, `releaseIdentityReviewItem`) assert the owner path.
 *
 * Opens no socket.
 */
import type pg from 'pg';

import type { CampaignAuthority } from './authority.js';
import { selectNextCandidate, type ClaimCandidate } from './scheduler.js';
import {
  ROOT_SUBJECT_KIND,
  STAGES,
  idempotencyKeyOf,
  priorityOf,
  requiredResources,
  reservationFor,
  retryDelaySeconds,
  type ChildRefusal,
  type FailureReason,
  type HumanQueue,
  type ItemState,
  type RefusalReason,
  type Resource,
  type RetryReason,
  type SourceKind,
  type Stage,
  type SubjectKind,
} from './vocabulary.js';

type Queryable = pg.Pool | pg.PoolClient;

/** One unit of campaign work, as the worker and its handlers see it. */
export interface WorkItemView {
  readonly id: string;
  readonly campaignId: string;
  readonly stage: Stage;
  readonly sourceKind: SourceKind;
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly registrableDomain: string | null;
  readonly parentItemId: string | null;
  readonly priority: number;
  readonly idempotencyKey: string;
}

/** What a handler asks to be enqueued at the next stage. */
export interface WorkItemSeed {
  readonly subjectKind: SubjectKind;
  readonly subjectId: string;
  readonly registrableDomain?: string | null;
}

export interface ClaimedWork {
  readonly claimId: string;
  readonly attemptNo: number;
  readonly workerId: string;
  readonly leaseExpiresAtMs: number;
  /** What this attempt reserved: the most its outcome may report (migration 0024). */
  readonly reserved: Consumption;
  readonly item: WorkItemView;
}

export type ClaimResult =
  | { readonly kind: 'CLAIMED'; readonly claim: ClaimedWork }
  | {
      readonly kind: 'NONE';
      readonly reason: 'NOTHING_DUE' | 'CONCURRENCY_CAP' | 'BUDGET_EXHAUSTED';
      /** The exhausted resource that alone kept an item from being claimed. */
      readonly exhausted: Resource | null;
    };

export interface Consumption {
  readonly searchRuns: number;
  readonly researchRoots: number;
  readonly gatewayRequests: number;
}

export const NO_CONSUMPTION: Consumption = Object.freeze({
  searchRuns: 0,
  researchRoots: 0,
  gatewayRequests: 0,
});

/** The outcome as it is recorded (the worker maps a handler's StageOutcome onto it). */
export type RecordedOutcome =
  | {
      readonly kind: 'ADVANCED';
      readonly nextStage: Stage | null;
      readonly children: readonly WorkItemSeed[];
    }
  | { readonly kind: 'RETRY_SCHEDULED'; readonly reason: RetryReason }
  | { readonly kind: 'REFUSED_TERMINAL'; readonly reason: RefusalReason }
  | { readonly kind: 'AWAITING_HUMAN'; readonly queue: HumanQueue }
  | { readonly kind: 'FAILED_TERMINAL'; readonly reason: FailureReason };

export interface RecordOutcomeResult {
  readonly outcomeId: string;
  /** What was actually recorded: an emergency stop turns any outcome into a refusal. */
  readonly recorded: RecordedOutcome['kind'];
  readonly producedChildIds: readonly string[];
  readonly childRefusals: readonly ChildRefusal[];
  readonly retryNotBeforeMs: number | null;
}

export type OutcomeRefusalCode = 'CLAIM_SUPERSEDED' | 'OUTCOME_ALREADY_RECORDED';

/** The claim can no longer carry an outcome. Nothing was written. */
export class OutcomeRefusedError extends Error {
  constructor(readonly code: OutcomeRefusalCode) {
    super(code);
    this.name = 'OutcomeRefusedError';
  }
}

interface ItemRow {
  id: string;
  campaign_id: string;
  stage: Stage;
  source_kind: SourceKind;
  subject_kind: SubjectKind;
  subject_id: string;
  registrable_domain: string | null;
  parent_item_id: string | null;
  priority: number;
  idempotency_key: string;
}

function itemView(r: ItemRow): WorkItemView {
  return Object.freeze({
    id: r.id,
    campaignId: r.campaign_id,
    stage: r.stage,
    sourceKind: r.source_kind,
    subjectKind: r.subject_kind,
    subjectId: r.subject_id,
    registrableDomain: r.registrable_domain,
    parentItemId: r.parent_item_id,
    priority: r.priority,
    idempotencyKey: r.idempotency_key,
  });
}

async function lockCampaign(client: pg.PoolClient, campaignId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(acquisition_campaign_lock_key($1))', [
    campaignId,
  ]);
}

/** The capability role migration 0023 creates. */
export const ACQUISITION_WORKER_ROLE = 'nwf_acquisition_worker';

/** The session cannot act as the worker capability. Nothing was written. */
export class WorkerSessionRefused extends Error {
  constructor(readonly detail: string) {
    super(`WORKER_SESSION_REFUSED: ${detail}`);
    this.name = 'WorkerSessionRefused';
  }
}

/**
 * Refuses a superuser or table-owner session and a login that does not hold
 * the worker capability, then (inside a transaction) narrows to exactly it.
 */
export async function enterWorkerCapability(client: pg.PoolClient, narrow: boolean): Promise<void> {
  const { rows } = await client.query<{ super: boolean; holder: boolean; owner: boolean }>(
    `SELECT r.rolsuper AS super,
            pg_has_role(session_user, $1, 'MEMBER') AS holder,
            pg_has_role(session_user, c.relowner, 'MEMBER') AS owner
       FROM pg_roles r, pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE r.rolname = session_user AND n.nspname = 'public'
        AND c.relname = 'acquisition_work_items'`,
    [ACQUISITION_WORKER_ROLE],
  );
  const session = rows[0];
  if (session === undefined || session.super) {
    throw new WorkerSessionRefused('a superuser connection is refused.');
  }
  if (session.owner) throw new WorkerSessionRefused('a table-owner connection is refused.');
  if (!session.holder) {
    throw new WorkerSessionRefused(`the connection does not hold ${ACQUISITION_WORKER_ROLE}.`);
  }
  if (narrow) await client.query(`SET LOCAL ROLE ${ACQUISITION_WORKER_ROLE}`);
}

/** Proves, without writing, that `pool`'s login may act as the worker. */
export async function assertWorkerSession(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await enterWorkerCapability(client, false);
  } finally {
    client.release();
  }
}

/** One transaction narrowed to the worker capability. Any throw rolls everything back. */
export async function inWorkerTransaction<T>(
  pool: pg.Pool,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(pool, async (client) => {
    await enterWorkerCapability(client, true);
    return fn(client);
  });
}

/** Refuses anything but the owner path (the role that owns the acquisition tables). */
export class OwnerPathRequired extends Error {
  constructor() {
    super('OWNER_PATH_REQUIRED');
    this.name = 'OwnerPathRequired';
  }
}

async function inOwnerTransaction<T>(
  pool: pg.Pool,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  return inTransaction(pool, async (client) => {
    const { rows } = await client.query<{ owner: boolean }>(
      'SELECT acquisition_is_owner_path() AS owner',
    );
    if (rows[0]?.owner !== true) throw new OwnerPathRequired();
    return fn(client);
  });
}

async function inTransaction<T>(pool: pg.Pool, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

interface CampaignLimits {
  max_work_items: number;
  max_items_per_registrable_domain: number;
  max_attempts_per_item: number;
  max_concurrency: number;
  max_search_runs: number;
  max_research_roots: number;
  max_gateway_requests: number;
}

async function limitsOf(client: pg.PoolClient, campaignId: string): Promise<CampaignLimits> {
  const { rows } = await client.query<CampaignLimits>(
    `SELECT max_work_items, max_items_per_registrable_domain, max_attempts_per_item, max_concurrency,
            max_search_runs, max_research_roots, max_gateway_requests
       FROM acquisition_campaigns WHERE id = $1`,
    [campaignId],
  );
  return rows[0]!;
}

type InsertResult =
  | { readonly kind: 'INSERTED'; readonly id: string }
  | { readonly kind: 'REFUSED'; readonly refusal: ChildRefusal };

/**
 * Inserts ONE work item under the (already held) campaign lock, after the same
 * checks the database trigger repeats: duplicate, item budget, domain cap.
 */
async function insertItem(
  client: pg.PoolClient,
  limits: CampaignLimits,
  item: {
    campaignId: string;
    stage: Stage;
    sourceKind: SourceKind;
    subjectKind: SubjectKind;
    subjectId: string;
    registrableDomain: string | null;
    parentItemId: string | null;
  },
): Promise<InsertResult> {
  const key = idempotencyKeyOf(item.stage, item.subjectKind, item.subjectId);
  const { rows: counts } = await client.query<{ dup: boolean; total: number; per_domain: number }>(
    `SELECT EXISTS (SELECT 1 FROM acquisition_work_items
                     WHERE campaign_id = $1 AND idempotency_key = $2) AS dup,
            (SELECT count(*) FROM acquisition_work_items WHERE campaign_id = $1)::integer AS total,
            (SELECT count(*) FROM acquisition_work_items
              WHERE campaign_id = $1 AND registrable_domain = $3)::integer AS per_domain`,
    [item.campaignId, key, item.registrableDomain],
  );
  const c = counts[0]!;
  if (c.dup) return { kind: 'REFUSED', refusal: 'DUPLICATE' };
  if (c.total >= limits.max_work_items) {
    return { kind: 'REFUSED', refusal: 'WORK_ITEM_BUDGET_EXHAUSTED' };
  }
  if (item.registrableDomain !== null && c.per_domain >= limits.max_items_per_registrable_domain) {
    return { kind: 'REFUSED', refusal: 'DOMAIN_CAP_REACHED' };
  }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO acquisition_work_items
       (campaign_id, stage, source_kind, subject_kind, subject_id, registrable_domain,
        idempotency_key, parent_item_id, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      item.campaignId,
      item.stage,
      item.sourceKind,
      item.subjectKind,
      item.subjectId,
      item.registrableDomain,
      key,
      item.parentItemId,
      priorityOf(item.stage),
    ],
  );
  return { kind: 'INSERTED', id: rows[0]!.id };
}

export interface SeedResult {
  readonly inserted: readonly string[];
  readonly refused: readonly ChildRefusal[];
}

/**
 * Enqueues one DISCOVERED root per search grant the SIGNED campaign lists -
 * the only roots the worker itself may create. Idempotent.
 */
export async function seedCampaignSearchGrantRoots(
  pool: pg.Pool,
  authority: CampaignAuthority,
): Promise<SeedResult> {
  if (!authority.scope.sourceKinds.includes('SEARCH_GRANT')) return { inserted: [], refused: [] };
  return inWorkerTransaction(pool, async (client) => {
    await lockCampaign(client, authority.campaignId);
    const limits = await limitsOf(client, authority.campaignId);
    const inserted: string[] = [];
    const refused: ChildRefusal[] = [];
    for (const grantId of authority.scope.searchGrantIds) {
      const r = await insertItem(client, limits, {
        campaignId: authority.campaignId,
        stage: 'DISCOVERED',
        sourceKind: 'SEARCH_GRANT',
        subjectKind: ROOT_SUBJECT_KIND.SEARCH_GRANT,
        subjectId: grantId,
        registrableDomain: null,
        parentItemId: null,
      });
      if (r.kind === 'INSERTED') inserted.push(r.id);
      else refused.push(r.refusal);
    }
    return { inserted, refused };
  });
}

/**
 * OWNER PATH: enqueues one LINK_OUT (research run) or SEED (seed list) root.
 * The database refuses this for any role but the table owner.
 */
export async function enqueueOwnerRoot(
  ownerPool: pg.Pool,
  input: { campaignId: string; sourceKind: 'LINK_OUT' | 'SEED'; subjectId: string },
): Promise<InsertResult> {
  return inOwnerTransaction(ownerPool, async (client) => {
    await lockCampaign(client, input.campaignId);
    const limits = await limitsOf(client, input.campaignId);
    return insertItem(client, limits, {
      campaignId: input.campaignId,
      stage: 'DISCOVERED',
      sourceKind: input.sourceKind,
      subjectKind: ROOT_SUBJECT_KIND[input.sourceKind],
      subjectId: input.subjectId,
      registrableDomain: null,
      parentItemId: null,
    });
  });
}

/**
 * WORKER PATH (ADR 0030, migration 0024): enqueues one LINK_OUT root naming a
 * research run of one of THIS campaign's own CAMPAIGN admissions, when the
 * signed campaign lists LINK_OUT. The database re-checks both facts and still
 * refuses every other non-owner root. Idempotent (a second call is DUPLICATE).
 */
export async function enqueueCampaignLinkOutRoot(
  pool: pg.Pool,
  authority: {
    readonly campaignId: string;
    readonly scope: { readonly sourceKinds: readonly string[] };
  },
  researchRunId: string,
): Promise<InsertResult | null> {
  if (!authority.scope.sourceKinds.includes('LINK_OUT')) return null;
  return inWorkerTransaction(pool, async (client) => {
    await lockCampaign(client, authority.campaignId);
    const limits = await limitsOf(client, authority.campaignId);
    return insertItem(client, limits, {
      campaignId: authority.campaignId,
      stage: 'DISCOVERED',
      sourceKind: 'LINK_OUT',
      subjectKind: ROOT_SUBJECT_KIND.LINK_OUT,
      subjectId: researchRunId,
      registrableDomain: null,
      parentItemId: null,
    });
  });
}

/**
 * OWNER PATH: releases ONE identity-review item that is awaiting the OWNER to
 * ASSESSABLE (its single child, same subject and domain). Called only after
 * the OWNER-signed review was appended; the database refuses it for any other
 * role and for an item that is not awaiting a human.
 */
export async function releaseIdentityReviewItem(
  ownerPool: pg.Pool,
  input: { campaignId: string; identityReviewItemId: string },
): Promise<InsertResult> {
  return inOwnerTransaction(ownerPool, async (client) => {
    await lockCampaign(client, input.campaignId);
    const limits = await limitsOf(client, input.campaignId);
    const { rows } = await client.query<ItemRow>(
      `SELECT id, campaign_id, stage, source_kind, subject_kind, subject_id, registrable_domain,
              parent_item_id, priority, idempotency_key
         FROM acquisition_work_items WHERE id = $1 AND campaign_id = $2`,
      [input.identityReviewItemId, input.campaignId],
    );
    const parent = rows[0];
    if (parent === undefined || parent.stage !== 'IDENTITY_REVIEW') {
      return { kind: 'REFUSED', refusal: 'CAMPAIGN_CLOSED' } as const;
    }
    return insertItem(client, limits, {
      campaignId: input.campaignId,
      stage: 'ASSESSABLE',
      sourceKind: parent.source_kind,
      subjectKind: parent.subject_kind,
      subjectId: parent.subject_id,
      registrableDomain: parent.registrable_domain,
      parentItemId: parent.id,
    });
  });
}

/** The lease was lost: the attempt is superseded, finished or lapsed. */
export class LeaseLostError extends Error {
  constructor() {
    super('LEASE_LOST');
    this.name = 'LeaseLostError';
  }
}

/**
 * HEARTBEAT (migration 0024): extends a live claim's lease to now + `leaseSeconds`
 * (at most six hours after the claim). Refused - `LeaseLostError` - once the
 * attempt is no longer live; the worker then aborts the handler.
 */
export async function extendClaimLease(
  pool: pg.Pool,
  claim: ClaimedWork,
  leaseSeconds: number,
): Promise<number> {
  try {
    return await inWorkerTransaction(pool, async (client) => {
      const { rows } = await client.query<{ until: Date }>(
        `INSERT INTO acquisition_claim_lease_extensions
           (claim_id, work_item_id, extended_until, worker_id)
         VALUES ($1, $2,
                 LEAST(now() + make_interval(secs => $3::double precision),
                       (SELECT claimed_at + interval '6 hours'
                          FROM acquisition_work_claims WHERE id = $1)),
                 $4)
         RETURNING extended_until AS until`,
        [claim.claimId, claim.item.id, leaseSeconds, claim.workerId],
      );
      return rows[0]!.until.getTime();
    });
  } catch (error) {
    if (
      /LEASE_LOST|extended_until out of bounds|emergency stopped/.test((error as Error).message)
    ) {
      throw new LeaseLostError();
    }
    throw error;
  }
}

export interface ClaimOptions {
  readonly workerId: string;
  readonly leaseSeconds: number;
  /** Resources whose campaign budget is spent: stages that need them are not claimed. */
  readonly exhausted?: ReadonlySet<Resource>;
  /** Domains this worker will not serve now (open circuit). */
  readonly blockedDomains?: ReadonlySet<string>;
}

interface CandidateRow {
  work_item_id: string;
  stage: Stage;
  source_kind: SourceKind;
  registrable_domain: string | null;
  priority: number;
  created_at: Date;
  state: ItemState;
  latest_attempt_no: number | null;
  latest_claim_id: string | null;
}

/**
 * Claims the next item the fair scheduler chooses, in one transaction under
 * the campaign lock. An expired lease on an item whose attempts are exhausted
 * is closed here first (FAILED_TERMINAL), so no item is stranded.
 */
export async function claimNextWorkItem(
  pool: pg.Pool,
  authority: CampaignAuthority,
  options: ClaimOptions,
): Promise<ClaimResult> {
  return inWorkerTransaction(pool, async (client) => {
    const campaignId = authority.campaignId;
    await lockCampaign(client, campaignId);
    const limits = await limitsOf(client, campaignId);

    // Close stranded items: an expired lease with no attempt left.
    const { rows: stranded } = await client.query<{
      work_item_id: string;
      latest_claim_id: string;
    }>(
      `SELECT work_item_id, latest_claim_id FROM acquisition_work_item_states
        WHERE campaign_id = $1 AND state = 'LEASE_EXPIRED' AND latest_attempt_no >= $2
        ORDER BY work_item_id`,
      [campaignId, limits.max_attempts_per_item],
    );
    for (const s of stranded) {
      await client.query('SELECT pg_advisory_xact_lock(acquisition_item_lock_key($1))', [
        s.work_item_id,
      ]);
      await client.query(
        `INSERT INTO acquisition_work_outcomes
           (claim_id, work_item_id, outcome, failure_reason, recorded_by_worker_id)
         VALUES ($1, $2, 'FAILED_TERMINAL', 'LEASE_EXPIRED_ATTEMPTS_EXHAUSTED', $3)`,
        [s.latest_claim_id, s.work_item_id, options.workerId],
      );
    }

    const { rows: live } = await client.query<{ n: number }>(
      `SELECT count(*)::integer AS n FROM acquisition_work_item_states
        WHERE campaign_id = $1 AND state = 'CLAIMED'`,
      [campaignId],
    );
    if (live[0]!.n >= limits.max_concurrency) {
      return { kind: 'NONE', reason: 'CONCURRENCY_CAP', exhausted: null };
    }

    const { rows } = await client.query<CandidateRow>(
      `SELECT work_item_id, stage, source_kind, registrable_domain, priority, created_at, state,
              latest_attempt_no, latest_claim_id
         FROM acquisition_work_item_states
        WHERE campaign_id = $1
          AND state IN ('PENDING', 'LEASE_EXPIRED', 'RETRY_SCHEDULED')
          AND not_before <= now()
          AND (state <> 'RETRY_SCHEDULED' OR retry_not_before <= now())
          AND (stage = ANY ($2::text[]) OR stage = 'IDENTITY_REVIEW')
          AND COALESCE(latest_attempt_no, 0) < $3`,
      [campaignId, [...authority.scope.stages], limits.max_attempts_per_item],
    );
    // What the campaign has left, from its DERIVED spend (reservations count).
    const { rows: spendRows } = await client.query<Record<Resource, number>>(
      `SELECT search_runs AS "searchRuns", research_roots AS "researchRoots",
              gateway_requests AS "gatewayRequests"
         FROM acquisition_campaign_spend($1)`,
      [campaignId],
    );
    const spend = spendRows[0]!;
    const left: Record<Resource, number> = {
      searchRuns: limits.max_search_runs - spend.searchRuns,
      researchRoots: limits.max_research_roots - spend.researchRoots,
      gatewayRequests: limits.max_gateway_requests - spend.gatewayRequests,
    };
    const exhausted = new Set<Resource>(options.exhausted ?? []);
    let blockedBy: Resource | null = null;
    const claimable = rows.filter((r) => {
      const reservation = reservationFor(r.stage, r.source_kind);
      const missing = requiredResources(r.stage, r.source_kind).find(
        (res) => exhausted.has(res) || reservation[res] > left[res],
      );
      if (missing !== undefined) {
        blockedBy ??= missing;
        return false;
      }
      return true;
    });
    if (claimable.length === 0) {
      return blockedBy !== null
        ? { kind: 'NONE', reason: 'BUDGET_EXHAUSTED', exhausted: blockedBy }
        : { kind: 'NONE', reason: 'NOTHING_DUE', exhausted: null };
    }

    const { rows: history } = await client.query<{
      registrable_domain: string | null;
      last_at: Date;
      live: boolean;
    }>(
      `SELECT i.registrable_domain, max(c.claimed_at) AS last_at,
              bool_or(acquisition_claim_lease_until(c.id) > now()
                      AND NOT EXISTS (SELECT 1 FROM acquisition_work_outcomes o
                                       WHERE o.claim_id = c.id)) AS live
         FROM acquisition_work_claims c
         JOIN acquisition_work_items i ON i.id = c.work_item_id
        WHERE c.campaign_id = $1
        GROUP BY i.registrable_domain`,
      [campaignId],
    );
    const { rows: last } = await client.query<{ stage: Stage }>(
      `SELECT i.stage FROM acquisition_work_claims c
         JOIN acquisition_work_items i ON i.id = c.work_item_id
        WHERE c.campaign_id = $1
        ORDER BY c.claimed_at DESC, c.id DESC
        LIMIT 1`,
      [campaignId],
    );
    const { rows: deferredRows } = await client.query<{ registrable_domain: string }>(
      `SELECT DISTINCT registrable_domain FROM acquisition_signals
        WHERE campaign_id = $1 AND signal_kind = 'LARGE_HEI_TAGGED'`,
      [campaignId],
    );
    const blockedDomains = new Set(options.blockedDomains ?? []);
    for (const h of history) {
      if (h.live && h.registrable_domain !== null) blockedDomains.add(h.registrable_domain);
    }
    const candidates: ClaimCandidate[] = claimable.map((r) => ({
      workItemId: r.work_item_id,
      stage: r.stage,
      registrableDomain: r.registrable_domain,
      priority: r.priority,
      createdAtMs: r.created_at.getTime(),
    }));
    const chosen = selectNextCandidate(candidates, {
      lastStage: last[0]?.stage ?? null,
      domainLastServedMs: new Map(
        history.map((h) => [h.registrable_domain ?? '', h.last_at.getTime()] as const),
      ),
      blockedDomains,
      deferredDomains: new Set(deferredRows.map((r) => r.registrable_domain)),
    });
    if (chosen === null) return { kind: 'NONE', reason: 'NOTHING_DUE', exhausted: null };
    const row = claimable.find((r) => r.work_item_id === chosen.workItemId)!;
    const reservation = reservationFor(row.stage, row.source_kind);

    const { rows: claim } = await client.query<{
      id: string;
      attempt_no: number;
      lease_expires_at: Date;
    }>(
      `INSERT INTO acquisition_work_claims
         (work_item_id, campaign_id, attempt_no, worker_id, lease_expires_at,
          reserved_search_runs, reserved_research_roots, reserved_gateway_requests)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5::double precision), $6, $7, $8)
       RETURNING id, attempt_no, lease_expires_at`,
      [
        row.work_item_id,
        campaignId,
        (row.latest_attempt_no ?? 0) + 1,
        options.workerId,
        options.leaseSeconds,
        reservation.searchRuns,
        reservation.researchRoots,
        reservation.gatewayRequests,
      ],
    );
    const { rows: item } = await client.query<ItemRow>(
      `SELECT id, campaign_id, stage, source_kind, subject_kind, subject_id, registrable_domain,
              parent_item_id, priority, idempotency_key
         FROM acquisition_work_items WHERE id = $1`,
      [row.work_item_id],
    );
    return {
      kind: 'CLAIMED',
      claim: Object.freeze({
        claimId: claim[0]!.id,
        attemptNo: claim[0]!.attempt_no,
        workerId: options.workerId,
        leaseExpiresAtMs: claim[0]!.lease_expires_at.getTime(),
        reserved: Object.freeze({ ...reservation }),
        item: itemView(item[0]!),
      }),
    };
  });
}

/**
 * Claims ONE named item (no scheduling). Used by tests to prove the race
 * guard; the worker always goes through `claimNextWorkItem`.
 */
export async function claimSpecificWorkItem(
  pool: pg.Pool,
  input: {
    campaignId: string;
    workItemId: string;
    attemptNo: number;
    workerId: string;
    leaseSeconds: number;
  },
): Promise<string> {
  return inWorkerTransaction(pool, async (client) => {
    const { rows: item } = await client.query<{ stage: Stage; source_kind: SourceKind }>(
      'SELECT stage, source_kind FROM acquisition_work_items WHERE id = $1',
      [input.workItemId],
    );
    const r =
      item[0] === undefined
        ? { searchRuns: 0, researchRoots: 0, gatewayRequests: 0 }
        : reservationFor(item[0].stage, item[0].source_kind);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO acquisition_work_claims
         (work_item_id, campaign_id, attempt_no, worker_id, lease_expires_at,
          reserved_search_runs, reserved_research_roots, reserved_gateway_requests)
       VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5::double precision), $6, $7, $8)
       RETURNING id`,
      [
        input.workItemId,
        input.campaignId,
        input.attemptNo,
        input.workerId,
        input.leaseSeconds,
        r.searchRuns,
        r.researchRoots,
        r.gatewayRequests,
      ],
    );
    return rows[0]!.id;
  });
}

/**
 * Records the ONE outcome of a claim, and an ADVANCED outcome's children, in
 * one transaction under the campaign lock then the item lock (the same order
 * the claim path takes). An EMERGENCY_STOP observed here turns any outcome
 * but a failure into REFUSED_TERMINAL / CAMPAIGN_EMERGENCY_STOPPED, with no
 * children. A superseded claim (a later attempt exists) is refused.
 */
export async function recordWorkOutcome(
  pool: pg.Pool,
  claim: ClaimedWork,
  outcome: RecordedOutcome,
  consumption: Consumption,
  recordedByWorkerId: string,
): Promise<RecordOutcomeResult> {
  try {
    return await inWorkerTransaction(pool, async (client) => {
      const item = claim.item;
      await lockCampaign(client, item.campaignId);
      await client.query('SELECT pg_advisory_xact_lock(acquisition_item_lock_key($1))', [item.id]);
      const { rows: st } = await client.query<{ state: string }>(
        'SELECT acquisition_campaign_control_state($1) AS state',
        [item.campaignId],
      );
      let effective: RecordedOutcome = outcome;
      if (
        st[0]!.state === 'EMERGENCY_STOPPED' &&
        outcome.kind !== 'FAILED_TERMINAL' &&
        !(outcome.kind === 'REFUSED_TERMINAL' && outcome.reason === 'CAMPAIGN_EMERGENCY_STOPPED')
      ) {
        effective = { kind: 'REFUSED_TERMINAL', reason: 'CAMPAIGN_EMERGENCY_STOPPED' };
      }

      const produced: string[] = [];
      const refusals: ChildRefusal[] = [];
      if (effective.kind === 'ADVANCED' && effective.nextStage !== null) {
        const limits = await limitsOf(client, item.campaignId);
        for (const seed of effective.children) {
          const r = await insertItem(client, limits, {
            campaignId: item.campaignId,
            stage: effective.nextStage,
            sourceKind: item.sourceKind,
            subjectKind: seed.subjectKind,
            subjectId: seed.subjectId,
            registrableDomain: seed.registrableDomain ?? null,
            parentItemId: item.id,
          });
          if (r.kind === 'INSERTED') produced.push(r.id);
          else refusals.push(r.refusal);
        }
      }

      const retrySeconds =
        effective.kind === 'RETRY_SCHEDULED' ? retryDelaySeconds(claim.attemptNo) : null;
      const { rows } = await client.query<{ id: string; retry_not_before: Date | null }>(
        `INSERT INTO acquisition_work_outcomes
           (claim_id, work_item_id, outcome, next_stage, produced_child_ids, child_refusals,
            retry_reason, retry_not_before, refusal_reason, human_queue, failure_reason,
            search_runs_consumed, research_roots_consumed, gateway_requests_consumed,
            recorded_by_worker_id)
         VALUES ($1, $2, $3, $4, $5::uuid[], $6::text[], $7,
                 CASE WHEN $8::integer IS NULL THEN NULL
                      ELSE now() + make_interval(secs => $8::integer) END,
                 $9, $10, $11, $12, $13, $14, $15)
         RETURNING id, retry_not_before`,
        [
          claim.claimId,
          item.id,
          effective.kind,
          effective.kind === 'ADVANCED' ? effective.nextStage : null,
          produced,
          refusals,
          effective.kind === 'RETRY_SCHEDULED' ? effective.reason : null,
          retrySeconds,
          effective.kind === 'REFUSED_TERMINAL' ? effective.reason : null,
          effective.kind === 'AWAITING_HUMAN' ? effective.queue : null,
          effective.kind === 'FAILED_TERMINAL' ? effective.reason : null,
          consumption.searchRuns,
          consumption.researchRoots,
          consumption.gatewayRequests,
          recordedByWorkerId,
        ],
      );
      return {
        outcomeId: rows[0]!.id,
        recorded: effective.kind,
        producedChildIds: produced,
        childRefusals: refusals,
        retryNotBeforeMs: rows[0]!.retry_not_before?.getTime() ?? null,
      };
    });
  } catch (error) {
    const e = error as { message?: string; constraint?: string };
    if (/CLAIM_SUPERSEDED/.test(e.message ?? '')) throw new OutcomeRefusedError('CLAIM_SUPERSEDED');
    if (
      e.constraint === 'acquisition_work_outcomes_claim_uidx' ||
      e.constraint === 'acquisition_work_outcomes_one_terminal_per_item_uidx'
    ) {
      throw new OutcomeRefusedError('OUTCOME_ALREADY_RECORDED');
    }
    throw error;
  }
}

/** What a campaign has spent, DERIVED from its rows (a claim without an outcome counts its reservation). */
export interface CampaignUsage {
  readonly workItems: number;
  readonly searchRuns: number;
  readonly researchRoots: number;
  readonly gatewayRequests: number;
  /** Items whose latest outcome is AWAITING_HUMAN (all queues). */
  readonly awaitingHuman: number;
  /** Items that are not yet terminal (PENDING, CLAIMED, LEASE_EXPIRED, RETRY_SCHEDULED). */
  readonly open: number;
}

export async function loadCampaignUsage(q: Queryable, campaignId: string): Promise<CampaignUsage> {
  const { rows } = await q.query<{
    work_items: number;
    search_runs: number;
    research_roots: number;
    gateway_requests: number;
    awaiting_human: number;
    open: number;
  }>(
    `SELECT
        (SELECT count(*) FROM acquisition_work_items WHERE campaign_id = $1)::integer AS work_items,
        s.search_runs, s.research_roots, s.gateway_requests,
        (SELECT count(*) FROM acquisition_work_item_states
          WHERE campaign_id = $1 AND state = 'AWAITING_HUMAN')::integer AS awaiting_human,
        (SELECT count(*) FROM acquisition_work_item_states
          WHERE campaign_id = $1
            AND state IN ('PENDING', 'CLAIMED', 'LEASE_EXPIRED', 'RETRY_SCHEDULED'))::integer AS open
       FROM acquisition_campaign_spend($1) s`,
    [campaignId],
  );
  const r = rows[0]!;
  return {
    workItems: r.work_items,
    searchRuns: r.search_runs,
    researchRoots: r.research_roots,
    gatewayRequests: r.gateway_requests,
    awaitingHuman: r.awaiting_human,
    open: r.open,
  };
}

/**
 * Items the worker could still act on: not terminal, at a stage the campaign
 * lists or at the human gate. An item parked at a stage the campaign does not
 * list is out of this campaign's worker scope and does not keep it open.
 */
export async function countOpenInScope(
  q: Queryable,
  campaignId: string,
  stages: readonly string[],
): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    `SELECT count(*)::integer AS n FROM acquisition_work_item_states
      WHERE campaign_id = $1
        AND state IN ('PENDING', 'CLAIMED', 'LEASE_EXPIRED', 'RETRY_SCHEDULED')
        AND (stage = ANY ($2::text[]) OR stage = 'IDENTITY_REVIEW')`,
    [campaignId, [...stages]],
  );
  return rows[0]!.n;
}

/** Exported for status: the stages in pipeline order. */
export const STAGE_ORDER: readonly Stage[] = STAGES;

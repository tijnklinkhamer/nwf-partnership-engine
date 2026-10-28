/**
 * WW E-W - THE APPEND-ONLY WIRING RECORDS (migration 0024, ADR 0030).
 *
 * Every write runs as the worker capability (`inWorkerTransaction`: no
 * superuser, no table owner, `SET LOCAL ROLE nwf_acquisition_worker`), and
 * every table's trigger re-checks that the work item it names belongs to the
 * campaign and has a live, outcome-less claim - so a record can only be made
 * BY the attempt it describes. Inserts only; idempotent where a retry may
 * repeat one.
 *
 * Opens no socket. Never UPDATEs or DELETEs.
 */
import type pg from 'pg';

import { inWorkerTransaction, type WorkItemView } from '../acquisition/index.js';
import { ACQUISITION_WIRING_ACTOR_KEY } from './context.js';

export type SignalKind =
  | 'DUPLICATE_OF_WEBSITE_CLAIM'
  | 'DUPLICATE_OF_DISCOVERY_SUBJECT'
  | 'DUPLICATE_OF_EARLIER_NOMINATION'
  | 'DUPLICATE_OF_PLAN_EXCLUSION'
  | 'LARGE_HEI_TAGGED';

export type RelatedKind = 'WEBSITE_CLAIM' | 'DISCOVERY_SUBJECT' | 'NOMINATION';

/** Appends one relationship signal for a nomination item. A signal is never a merge. */
export async function recordSignal(
  worker: pg.Pool,
  item: WorkItemView,
  signal: {
    readonly kind: SignalKind;
    readonly nominationId: string | null;
    readonly related: { readonly kind: RelatedKind; readonly id: string } | null;
  },
): Promise<void> {
  await inWorkerTransaction(worker, (c) =>
    c.query(
      `INSERT INTO acquisition_signals
         (campaign_id, work_item_id, nomination_id, registrable_domain, signal_kind,
          related_kind, related_id, actor_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (work_item_id, signal_kind) DO NOTHING`,
      [
        item.campaignId,
        item.id,
        signal.nominationId,
        item.registrableDomain,
        signal.kind,
        signal.related?.kind ?? null,
        signal.related?.id ?? null,
        ACQUISITION_WIRING_ACTOR_KEY,
      ],
    ),
  );
}

/** Binds a proposed subject to the campaign that proposed it. Idempotent. */
export async function bindCampaignSubject(
  worker: pg.Pool,
  item: WorkItemView,
  binding: { readonly nominationId: string; readonly subjectId: string; readonly url: string },
): Promise<void> {
  await inWorkerTransaction(worker, (c) =>
    c.query(
      `INSERT INTO acquisition_campaign_subjects
         (campaign_id, work_item_id, nomination_id, subject_id, registrable_domain,
          nominated_url, actor_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (campaign_id, nomination_id) DO NOTHING`,
      [
        item.campaignId,
        item.id,
        binding.nominationId,
        binding.subjectId,
        item.registrableDomain,
        binding.url,
        ACQUISITION_WIRING_ACTOR_KEY,
      ],
    ),
  );
}

/** The binding of a subject inside a campaign, read as the worker. */
export async function loadCampaignSubject(
  worker: pg.Pool,
  campaignId: string,
  subjectId: string,
): Promise<{ nominationId: string; registrableDomain: string; nominatedUrl: string } | null> {
  const { rows } = await inWorkerTransaction(worker, (c) =>
    c.query<{ nomination_id: string; registrable_domain: string; nominated_url: string }>(
      `SELECT nomination_id, registrable_domain, nominated_url FROM acquisition_campaign_subjects
        WHERE campaign_id = $1 AND subject_id = $2`,
      [campaignId, subjectId],
    ),
  );
  const r = rows[0];
  return r === undefined
    ? null
    : {
        nominationId: r.nomination_id,
        registrableDomain: r.registrable_domain,
        nominatedUrl: r.nominated_url,
      };
}

/** What this item's EARLIER outcomes already reported, per resource (no double counting on retry). */
export async function alreadyReported(
  worker: pg.Pool,
  workItemId: string,
): Promise<{ searchRuns: number; researchRoots: number; gatewayRequests: number }> {
  const { rows } = await inWorkerTransaction(worker, (c) =>
    c.query<{ s: number; r: number; g: number }>(
      `SELECT COALESCE(sum(search_runs_consumed), 0)::int AS s,
              COALESCE(sum(research_roots_consumed), 0)::int AS r,
              COALESCE(sum(gateway_requests_consumed), 0)::int AS g
         FROM acquisition_work_outcomes WHERE work_item_id = $1`,
      [workItemId],
    ),
  );
  return { searchRuns: rows[0]!.s, researchRoots: rows[0]!.r, gatewayRequests: rows[0]!.g };
}

export interface CampaignAdmissionInsert {
  readonly item: WorkItemView;
  readonly subjectId: string;
  readonly identityClaimId: string;
  readonly websiteUrl: string;
  readonly trustScope: 'OPERATIONAL' | 'TEST_ONLY';
  readonly subjectStateDigest: string;
  readonly protectedRegistryDigest: string;
  readonly registryFingerprint: string;
}

/** The policy version a CAMPAIGN admission is recorded under (migration 0024). */
export const CAMPAIGN_ADMISSION_POLICY_VERSION = 'subject-research-admission-policy-campaign-v1';
/** A CAMPAIGN admission's validity: one day, the most migration 0024 allows. */
export const CAMPAIGN_ADMISSION_VALIDITY_SECONDS = 86400;

export class CampaignAdmissionRefused extends Error {
  constructor(readonly reason: string) {
    super(`CAMPAIGN_ADMISSION_REFUSED: ${reason}`);
    this.name = 'CampaignAdmissionRefused';
  }
}

/**
 * Appends ONE CAMPAIGN research admission. The database checks every fact it
 * can (RUNNING, window, RESEARCH_PENDING listed, in-flight item, subject
 * proposed inside the campaign, https on the nominated domain, research-root
 * budget, no other live admission); the signature was verified by the
 * worker's `deriveCampaignAuthority` before this item was ever claimed.
 */
export async function recordCampaignAdmission(
  worker: pg.Pool,
  a: CampaignAdmissionInsert,
): Promise<string> {
  try {
    const { rows } = await inWorkerTransaction(worker, (c) =>
      c.query<{ id: string }>(
        `INSERT INTO subject_research_admissions
           (subject_id, identity_claim_id, claim_kind, claim_basis, website_url, policy_version,
            identity_authority_scope, subject_state_digest, protected_registry_digest,
            registry_fingerprint, actor_key, reason, validity_seconds, admitted_at, expires_at,
            admission_basis, campaign_id, campaign_work_item_id)
         VALUES ($1, $2, 'PUBLIC_WEBSITE', 'SOURCE_STATED', $3, $4, $5, $6, $7, $8, $9,
                 'Bounded first-party research of a subject proposed inside an OWNER-signed campaign (ADR 0030).',
                 $10, now(), now() + interval '1 second', 'CAMPAIGN', $11, $12)
         RETURNING id`,
        [
          a.subjectId,
          a.identityClaimId,
          a.websiteUrl,
          CAMPAIGN_ADMISSION_POLICY_VERSION,
          a.trustScope,
          a.subjectStateDigest,
          a.protectedRegistryDigest,
          a.registryFingerprint,
          ACQUISITION_WIRING_ACTOR_KEY,
          CAMPAIGN_ADMISSION_VALIDITY_SECONDS,
          a.item.campaignId,
          a.item.id,
        ],
      ),
    );
    return rows[0]!.id;
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === '23514') {
      throw new CampaignAdmissionRefused(
        (e.message ?? '').replace(/^subject_research_admissions: /, '').slice(0, 120),
      );
    }
    throw error;
  }
}

/**
 * WW acceptance (migration 0028): supersedes the in-flight item's CAMPAIGN admission of an
 * EARLIER attempt that never started a run (the database checks every condition: the
 * worker's own actor key, the reason, the item in flight, an earlier attempt, no run, not
 * already revoked). Refused otherwise, as a CampaignAdmissionRefused.
 */
export async function supersedeCampaignAdmission(
  worker: pg.Pool,
  admissionId: string,
): Promise<void> {
  try {
    await inWorkerTransaction(worker, (c) =>
      c.query(
        `INSERT INTO subject_research_admission_revocations (admission_id, actor_key, reason)
         VALUES ($1, $2, 'CAMPAIGN_ATTEMPT_SUPERSEDED')`,
        [admissionId, ACQUISITION_WIRING_ACTOR_KEY],
      ),
    );
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === '23514') {
      throw new CampaignAdmissionRefused(
        (e.message ?? '').replace(/^subject_research_admission_revocations: /, '').slice(0, 120),
      );
    }
    throw error;
  }
}

export type OutboxEntryKind = 'RESEARCH_EXPORT' | 'ASSESSABLE_MANIFEST';

export const OUTBOX_FORMAT = 'nwf-pe.acquisition-outbox.v1';

/** Appends one outbox entry (digests only). Idempotent per (item, kind). */
export async function recordOutboxEntry(
  worker: pg.Pool,
  item: WorkItemView,
  entry: {
    readonly kind: OutboxEntryKind;
    readonly exportV2Sha256: string;
    readonly subjectFactsSha256: string;
  },
): Promise<void> {
  await inWorkerTransaction(worker, (c) =>
    c.query(
      `INSERT INTO acquisition_outbox_entries
         (campaign_id, work_item_id, subject_id, entry_kind, outbox_format, export_v2_sha256,
          subject_facts_sha256, actor_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (work_item_id, entry_kind) DO NOTHING`,
      [
        item.campaignId,
        item.id,
        item.subjectId,
        entry.kind,
        OUTBOX_FORMAT,
        entry.exportV2Sha256,
        entry.subjectFactsSha256,
        ACQUISITION_WIRING_ACTOR_KEY,
      ],
    ),
  );
}

export interface OutboxEntryRow {
  readonly workItemId: string;
  readonly subjectId: string;
  readonly kind: OutboxEntryKind;
  readonly exportV2Sha256: string;
  readonly subjectFactsSha256: string;
  readonly recordedAt: string;
}

/** A campaign's outbox entries, oldest first, read with any pool that may SELECT them. */
export async function loadOutboxEntries(
  q: pg.Pool | pg.PoolClient,
  campaignId: string,
  kind: OutboxEntryKind,
): Promise<OutboxEntryRow[]> {
  const { rows } = await q.query<{
    work_item_id: string;
    subject_id: string;
    entry_kind: OutboxEntryKind;
    export_v2_sha256: string;
    subject_facts_sha256: string;
    recorded_at: Date;
  }>(
    `SELECT work_item_id, subject_id, entry_kind, export_v2_sha256, subject_facts_sha256, recorded_at
       FROM acquisition_outbox_entries
      WHERE campaign_id = $1 AND entry_kind = $2
      ORDER BY recorded_at, id`,
    [campaignId, kind],
  );
  return rows.map((r) => ({
    workItemId: r.work_item_id,
    subjectId: r.subject_id,
    kind: r.entry_kind,
    exportV2Sha256: r.export_v2_sha256,
    subjectFactsSha256: r.subject_facts_sha256,
    recordedAt: r.recorded_at.toISOString(),
  }));
}

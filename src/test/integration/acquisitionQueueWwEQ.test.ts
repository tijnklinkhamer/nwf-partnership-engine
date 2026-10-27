/**
 * WW E-Q - OWNER-signed acquisition campaigns and the append-only work queue
 * against a DISPOSABLE PostgreSQL (migration 0023, ADR 0029).
 *
 * Every campaign is signed by an in-memory TEST_ONLY key; every stage handler
 * is scripted; every subject id is a random uuid. Nothing here reaches a
 * network, a model or a real organisation.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import {
  CampaignRecordRefusal,
  CampaignTrustSet,
  OutcomeRefusedError,
  OwnerPathRequired,
  WorkerConfigRefusal,
  claimNextWorkItem,
  deriveCampaignAuthority,
  enqueueOwnerRoot,
  loadCampaignStatus,
  recordCampaign,
  recordControlEvent,
  recordWorkOutcome,
  runWorker,
  seedCampaignSearchGrantRoots,
  type CampaignAuthority,
  type ClaimedWork,
  type StageHandler,
  type StageOutcome,
  type WorkItemView,
} from '../../orgunits/acquisition/index.js';
import { claimSpecificWorkItem } from '../../orgunits/acquisition/store.js';
import {
  campaignTrustEntry,
  signedCampaign,
  testCampaignKey,
  testCampaignTrust,
  type CampaignDraft,
} from '../helpers/acquisitionCampaignFixtures.js';
import { adminPool, databaseConfigured, readonlyPool } from './helpers.js';

const describeDb = databaseConfigured() ? describe : describe.skip;

const SUFFIX = randomBytes(4).toString('hex');
const WORKER_LOGIN = `nwf_acq_test_worker_${SUFFIX}`;
const PASSWORD = randomBytes(24).toString('hex');
const KEY = testCampaignKey();
const TRUST = testCampaignTrust(campaignTrustEntry(KEY));
const FAST = { idleSleepMs: 10, idleTimeoutMs: 300, controlPollMs: 20 } as const;

function urlFor(login: string): string {
  const url = new URL(testDatabaseUrl('admin')!);
  url.username = login;
  url.password = PASSWORD;
  return url.toString();
}

async function sqlstate(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return String((err as { code?: string }).code);
  }
  return 'SUCCEEDED';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describeDb('WW E-Q acquisition campaigns and queue (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let worker: pg.Pool;
  let worker2: pg.Pool;
  let env: string;

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await admin.query(`CREATE ROLE ${WORKER_LOGIN} LOGIN PASSWORD '${PASSWORD}'`);
    await admin.query(`GRANT nwf_acquisition_worker TO ${WORKER_LOGIN}`);
    worker = new pg.Pool({ connectionString: urlFor(WORKER_LOGIN), max: 4 });
    worker2 = new pg.Pool({ connectionString: urlFor(WORKER_LOGIN), max: 4 });
    const { rows } = await admin.query<{ id: string }>(
      'SELECT environment_id AS id FROM subject_review_environment',
    );
    env = rows[0]!.id;
  });

  afterAll(async () => {
    await Promise.all([worker?.end(), worker2?.end()]);
    await admin.query(`DROP OWNED BY ${WORKER_LOGIN}`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${WORKER_LOGIN}`);
    await Promise.all([admin?.end(), readonly?.end()]);
  });

  beforeEach(async () => {
    await admin.query(
      // WW E-W (migration 0024): the wiring tables and CAMPAIGN admissions
      // reference campaigns and items, so they are truncated with them.
      `TRUNCATE acquisition_claim_lease_extensions, acquisition_outbox_entries,
                acquisition_signals, acquisition_campaign_subjects,
                subject_research_admission_revocations, subject_research_admissions,
                acquisition_worker_stops, acquisition_work_outcomes, acquisition_work_claims,
                acquisition_work_items, acquisition_campaign_control_events, acquisition_campaigns
                CASCADE`,
    );
  });

  async function record(draft: Partial<CampaignDraft> = {}): Promise<string> {
    const text = signedCampaign(KEY, { environmentId: env, ...draft });
    const r = await recordCampaign(
      admin,
      Buffer.from(text),
      { actorKey: 'owner-cli' },
      { trust: TRUST },
    );
    return r.campaignId;
  }

  async function started(draft: Partial<CampaignDraft> = {}): Promise<string> {
    const id = await record(draft);
    await recordControlEvent(
      admin,
      { campaignId: id, action: 'START', actorKey: 'owner-cli' },
      { trust: TRUST },
    );
    return id;
  }

  async function authority(id: string, pool = worker): Promise<CampaignAuthority> {
    const d = await deriveCampaignAuthority(pool, id, { trust: TRUST });
    if (!d.ok) throw new Error(`authority refused: ${d.code}`);
    return d.authority;
  }

  const handler = (
    stage: StageHandler['stage'],
    fn: (
      item: WorkItemView,
      ctx: Parameters<StageHandler['handle']>[1],
    ) => Promise<StageOutcome> | StageOutcome,
  ): StageHandler => ({ stage, handle: async (item, ctx) => fn(item, ctx) });

  const nominate = (domains: readonly string[]) =>
    handler('DISCOVERED', (_item, ctx) => {
      ctx.consume('searchRuns', 1);
      return {
        kind: 'ADVANCED',
        next: 'NOMINATED',
        children: domains.map((d) => ({
          subjectKind: 'NOMINATION' as const,
          subjectId: randomUUID(),
          registrableDomain: d,
        })),
      };
    });

  const run = (
    id: string,
    handlers: readonly StageHandler[],
    extra: Partial<Parameters<typeof runWorker>[0]> = {},
  ) =>
    runWorker({
      pool: worker,
      campaignId: id,
      workerId: 'test-worker-a',
      handlers,
      trust: TRUST,
      ...FAST,
      ...extra,
    });

  // -------------------------------------------------------------------------

  describe('recording and verifying a campaign (owner path)', () => {
    it('records a verified campaign NOT_STARTED, idempotently, and the DB holds the signed bytes', async () => {
      const text = signedCampaign(KEY, { environmentId: env });
      const first = await recordCampaign(
        admin,
        Buffer.from(text),
        { actorKey: 'owner-cli' },
        { trust: TRUST },
      );
      const again = await recordCampaign(
        admin,
        Buffer.from(text),
        { actorKey: 'owner-cli' },
        { trust: TRUST },
      );
      expect(first.outcome).toBe('RECORDED');
      expect(again).toEqual({ ...first, outcome: 'ALREADY_RECORDED' });
      const { rows } = await admin.query<{ state: string; same: boolean }>(
        `SELECT acquisition_campaign_control_state(id) AS state,
                convert_from(decode(translate(payload_base64url, '-_', '+/') ||
                  repeat('=', (4 - length(payload_base64url) % 4) % 4), 'base64'), 'UTF8')::jsonb
                  = document AS same
           FROM acquisition_campaigns`,
      );
      expect(rows).toEqual([{ state: 'NOT_STARTED', same: true }]);
      // A document that is not the signed payload is refused by the database.
      expect(
        await sqlstate(() =>
          admin.query(
            `INSERT INTO acquisition_campaigns
               SELECT gen_random_uuid(), environment_id, campaign_key || '-x', document_version,
                      document || '{"purpose":"tampered"}', payload_base64url, payload_sha256,
                      signature, key_id, key_fingerprint, nonce, issued_at, starts_at, ends_at,
                      geographies, source_kinds, allowed_stages, search_grant_ids, max_work_items,
                      max_search_runs, max_research_roots, max_gateway_requests,
                      max_items_per_registrable_domain, max_concurrency, max_attempts_per_item,
                      max_awaiting_human_backlog, actor_key, now()
                 FROM acquisition_campaigns`,
          ),
        ),
      ).toBe('23514');
    });

    it('refuses an unknown key, a bad signature, the operational (empty) set and a closed window', async () => {
      const refuse = async (bytes: string, trust: CampaignTrustSet = TRUST) => {
        try {
          await recordCampaign(admin, Buffer.from(bytes), { actorKey: 'owner-cli' }, { trust });
        } catch (error) {
          if (error instanceof CampaignRecordRefusal) return `${error.code}:${error.detail}`;
          throw error;
        }
        return 'RECORDED';
      };
      expect(
        await refuse(signedCampaign(testCampaignKey('test-other'), { environmentId: env })),
      ).toBe('ENVELOPE_INVALID:KEY_UNKNOWN');
      const good = JSON.parse(signedCampaign(KEY, { environmentId: env })) as Record<
        string,
        string
      >;
      const sig = (
        JSON.parse(signedCampaign(KEY, { environmentId: env })) as Record<string, string>
      )['signature'];
      expect(await refuse(`${JSON.stringify({ ...good, signature: sig })}\n`)).toBe(
        'ENVELOPE_INVALID:SIGNATURE_INVALID',
      );
      expect(
        await refuse(signedCampaign(KEY, { environmentId: env }), CampaignTrustSet.operational()),
      ).toBe('ENVELOPE_INVALID:KEY_UNKNOWN');
      const past = Date.now() - 3 * 24 * 3600 * 1000;
      expect(
        await refuse(
          signedCampaign(KEY, {
            environmentId: env,
            startsAtMs: past,
            endsAtMs: past + 3600 * 1000,
          }),
        ),
      ).toBe('WINDOW_CLOSED:null');
      expect(await refuse(signedCampaign(KEY, { environmentId: randomUUID() }))).toBe(
        'ENVIRONMENT_MISMATCH:null',
      );
      expect(
        (await admin.query('SELECT count(*)::int AS n FROM acquisition_campaigns')).rows[0].n,
      ).toBe(0);
    });

    it('a stored campaign derives NO authority under the operational trust set, and START is refused', async () => {
      const id = await record();
      const d = await deriveCampaignAuthority(worker, id);
      expect(d).toMatchObject({ ok: false, code: 'CAMPAIGN_UNVERIFIED', detail: 'KEY_UNKNOWN' });
      await expect(
        recordControlEvent(admin, { campaignId: id, action: 'START', actorKey: 'owner-cli' }),
      ).rejects.toMatchObject({ code: 'CAMPAIGN_UNVERIFIED' });
      // ... but a halt never needs verification.
      await recordControlEvent(admin, { campaignId: id, action: 'STOP', actorKey: 'owner-cli' });
    });

    it('a REVOKED key withdraws every campaign it signed', async () => {
      const id = await started();
      const revoked = testCampaignTrust(campaignTrustEntry(KEY, 'REVOKED'));
      expect(await deriveCampaignAuthority(worker, id, { trust: revoked })).toMatchObject({
        ok: false,
        code: 'CAMPAIGN_UNVERIFIED',
        detail: 'KEY_NOT_AUTHORITATIVE',
      });
    });

    it('a future window records, starts, but the worker refuses to claim', async () => {
      const soon = Date.now() + 3600 * 1000;
      const id = await started({ startsAtMs: soon, endsAtMs: soon + 3600 * 1000 });
      const summary = await run(id, [nominate([])]);
      expect(summary.stopReason).toBe('CAMPAIGN_WINDOW_NOT_OPEN');
      expect(summary.processed).toBe(0);
    });

    it('the worker role cannot write campaigns or control events, and nobody can UPDATE or DELETE', async () => {
      const id = await record();
      expect(
        await sqlstate(() =>
          worker.query(
            `INSERT INTO acquisition_campaign_control_events (campaign_id, sequence_no, action, actor_key)
                        VALUES ($1, 1, 'START', 'owner-cli')`,
            [id],
          ),
        ),
      ).toBe('42501');
      expect(
        await sqlstate(() =>
          worker.query(`INSERT INTO acquisition_campaigns SELECT * FROM acquisition_campaigns`),
        ),
      ).toBe('42501');
      expect(
        await sqlstate(() => worker.query(`UPDATE acquisition_work_items SET priority = 0`)),
      ).toBe('42501');
      expect(await sqlstate(() => worker.query(`DELETE FROM acquisition_work_claims`))).toBe(
        '42501',
      );
      expect(
        await sqlstate(() => admin.query(`UPDATE acquisition_campaigns SET actor_key = 'x-y-z'`)),
      ).toBe('55000');
      expect(await sqlstate(() => admin.query(`DELETE FROM acquisition_campaigns`))).toBe('55000');
      const { rows } = await admin.query<{ g: string }>(
        `SELECT table_name || ':' || privilege_type AS g FROM information_schema.role_table_grants
          WHERE grantee = 'nwf_acquisition_worker' ORDER BY 1`,
      );
      // WW E-W (migration 0024, by exact grant): the wiring records, lease
      // heartbeats, CAMPAIGN admissions (the trigger refuses any other basis
      // from this role), revocations and the one environment row - SELECT and
      // INSERT only, never a mutating privilege.
      expect(rows.map((r) => r.g)).toEqual([
        'acquisition_campaign_control_events:SELECT',
        'acquisition_campaign_subjects:INSERT',
        'acquisition_campaign_subjects:SELECT',
        'acquisition_campaigns:SELECT',
        'acquisition_claim_lease_extensions:INSERT',
        'acquisition_claim_lease_extensions:SELECT',
        'acquisition_outbox_entries:INSERT',
        'acquisition_outbox_entries:SELECT',
        'acquisition_signals:INSERT',
        'acquisition_signals:SELECT',
        'acquisition_work_claims:INSERT',
        'acquisition_work_claims:SELECT',
        'acquisition_work_item_states:SELECT',
        'acquisition_work_items:INSERT',
        'acquisition_work_items:SELECT',
        'acquisition_work_outcomes:INSERT',
        'acquisition_work_outcomes:SELECT',
        'acquisition_worker_stops:INSERT',
        'acquisition_worker_stops:SELECT',
        'subject_research_admission_revocations:SELECT',
        'subject_research_admissions:INSERT',
        'subject_research_admissions:SELECT',
        'subject_review_environment:SELECT',
      ]);
    });
  });

  describe('the queue', () => {
    it('enqueues idempotently, and only the signed search grants may be worker roots', async () => {
      const grant = randomUUID();
      const id = await started({ searchGrantIds: [grant] });
      const auth = await authority(id);
      expect((await seedCampaignSearchGrantRoots(worker, auth)).inserted).toHaveLength(1);
      expect(await seedCampaignSearchGrantRoots(worker, auth)).toEqual({
        inserted: [],
        refused: ['DUPLICATE'],
      });
      const insertRoot = (pool: pg.Pool, kind: string, subject: string, sourceKind = kind) =>
        sqlstate(() =>
          pool.query(
            `INSERT INTO acquisition_work_items
               (campaign_id, stage, source_kind, subject_kind, subject_id, idempotency_key, priority)
             VALUES ($1, 'DISCOVERED', $2::text, $3::text, $4::uuid,
                     'DISCOVERED|' || $3::text || ':' || $4::text, 0)`,
            [id, sourceKind, kind, subject],
          ),
        );
      expect(await insertRoot(worker, 'SEARCH_GRANT', grant)).toBe('23505');
      expect(await insertRoot(worker, 'SEARCH_GRANT', randomUUID())).toBe('23514');
    });

    it('a concurrent claim of the same attempt has exactly one winner', async () => {
      const id = await started({ searchGrantIds: [randomUUID()] });
      await seedCampaignSearchGrantRoots(worker, await authority(id));
      const { rows } = await admin.query<{ id: string }>('SELECT id FROM acquisition_work_items');
      const claim = (pool: pg.Pool, w: string) =>
        claimSpecificWorkItem(pool, {
          campaignId: id,
          workItemId: rows[0]!.id,
          attemptNo: 1,
          workerId: w,
          leaseSeconds: 60,
        });
      const results = await Promise.allSettled([
        claim(worker, 'test-worker-a'),
        claim(worker2, 'test-worker-b'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(['23505', '23514']).toContain((loser.reason as { code: string }).code);
      expect(
        (await admin.query('SELECT count(*)::int AS n FROM acquisition_work_claims')).rows[0].n,
      ).toBe(1);
    });

    it('enforces the concurrency cap across workers', async () => {
      const id = await started({
        searchGrantIds: [randomUUID(), randomUUID()],
        budgets: { maxConcurrency: '1' },
      });
      const auth = await authority(id);
      await seedCampaignSearchGrantRoots(worker, auth);
      const first = await claimNextWorkItem(worker, auth, {
        workerId: 'test-worker-a',
        leaseSeconds: 60,
      });
      expect(first.kind).toBe('CLAIMED');
      const second = await claimNextWorkItem(worker2, auth, {
        workerId: 'test-worker-b',
        leaseSeconds: 60,
      });
      expect(second).toEqual({ kind: 'NONE', reason: 'CONCURRENCY_CAP', exhausted: null });
    });

    it('an expired lease is retried as attempt 2, and the stale attempt can never also ADVANCE', async () => {
      const id = await started({ searchGrantIds: [randomUUID()], stages: ['DISCOVERED'] });
      const auth = await authority(id);
      await seedCampaignSearchGrantRoots(worker, auth);
      // A worker claims with a 1 s lease and "dies" mid-item.
      const zombie = await claimNextWorkItem(worker, auth, {
        workerId: 'test-worker-z',
        leaseSeconds: 1,
      });
      expect(zombie.kind).toBe('CLAIMED');
      await sleep(1200);
      const summary = await run(id, [nominate(['example-fict.nl'])]);
      expect(summary.outcomes.ADVANCED).toBe(1);
      // The NOMINATED child is parked outside this campaign's worker stages: drained.
      expect(summary.stopReason).toBe('QUEUE_DRAINED');
      const { rows: claims } = await admin.query<{ attempt_no: number }>(
        'SELECT attempt_no FROM acquisition_work_claims ORDER BY attempt_no',
      );
      expect(claims.map((c) => c.attempt_no)).toEqual([1, 2]);
      // The dead worker comes back and tries to record its outcome.
      const stale = (zombie as { claim: ClaimedWork }).claim;
      await expect(
        recordWorkOutcome(
          worker,
          stale,
          { kind: 'ADVANCED', nextStage: 'NOMINATED', children: [] },
          { searchRuns: 0, researchRoots: 0, gatewayRequests: 0 },
          'test-worker-z',
        ),
      ).rejects.toBeInstanceOf(OutcomeRefusedError);
      // And even with every trigger bypassed, the index refuses a second terminal outcome.
      const client = await admin.connect();
      try {
        await client.query(`SET session_replication_role = replica`);
        expect(
          await sqlstate(() =>
            client.query(
              `INSERT INTO acquisition_work_outcomes (claim_id, work_item_id, outcome, next_stage, recorded_by_worker_id)
               VALUES ($1, $2, 'ADVANCED', 'NOMINATED', 'test-worker-z')`,
              [stale.claimId, stale.item.id],
            ),
          ),
        ).toBe('23505');
      } finally {
        await client.query(`SET session_replication_role = origin`);
        client.release();
      }
    });

    it('schedules a retry by the capped backoff and never claims it early', async () => {
      const id = await started({
        searchGrantIds: [randomUUID()],
        budgets: { maxAttemptsPerItem: '2' },
      });
      const flaky = handler('DISCOVERED', () => ({
        kind: 'RETRY',
        reason: 'TRANSIENT_PROVIDER_FAILURE',
        retryable: true,
      }));
      const first = await run(id, [flaky], { once: true });
      expect(first.outcomes.RETRY_SCHEDULED).toBe(1);
      const { rows } = await admin.query<{ secs: number }>(
        `SELECT extract(epoch FROM retry_not_before - recorded_at)::int AS secs FROM acquisition_work_outcomes`,
      );
      expect(rows[0]!.secs).toBe(60);
      const early = await run(id, [flaky], { once: true });
      expect(early).toMatchObject({ stopReason: 'IDLE', processed: 0 });
    });

    it('the database itself refuses a RETRY at the last permitted attempt', async () => {
      const id = await started({
        searchGrantIds: [randomUUID()],
        budgets: { maxAttemptsPerItem: '1' },
      });
      const auth = await authority(id);
      await seedCampaignSearchGrantRoots(worker, auth);
      const claimed = await claimNextWorkItem(worker, auth, {
        workerId: 'test-worker-a',
        leaseSeconds: 60,
      });
      const claim = (claimed as { claim: ClaimedWork }).claim;
      await expect(
        recordWorkOutcome(
          worker,
          claim,
          { kind: 'RETRY_SCHEDULED', reason: 'RATE_LIMITED' },
          { searchRuns: 0, researchRoots: 0, gatewayRequests: 0 },
          'test-worker-a',
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });

    it('a handler at the LAST attempt that asks for a retry fails terminally', async () => {
      const id = await started({
        searchGrantIds: [randomUUID()],
        budgets: { maxAttemptsPerItem: '1' },
      });
      const summary = await run(id, [
        handler('DISCOVERED', () => ({ kind: 'RETRY', reason: 'RATE_LIMITED', retryable: true })),
      ]);
      expect(summary.outcomes.FAILED_TERMINAL).toBe(1);
      expect(summary.stopReason).toBe('QUEUE_DRAINED');
      const status = await loadCampaignStatus(readonly, id, TRUST);
      expect(status!.failures).toEqual({ ATTEMPTS_EXHAUSTED: 1 });
    });

    it('records terminal refusals with their closed reason, and invalid handler output as such', async () => {
      const id = await started({ searchGrantIds: [randomUUID(), randomUUID()] });
      let n = 0;
      const summary = await run(id, [
        handler('DISCOVERED', () => {
          n += 1;
          return n === 1
            ? { kind: 'REFUSED', reason: 'GRANT_UNAVAILABLE' }
            : ({ kind: 'ADVANCED', next: 'RESEARCHED' } as StageOutcome);
        }),
      ]);
      expect(summary).toMatchObject({ stopReason: 'QUEUE_DRAINED', processed: 2 });
      const status = await loadCampaignStatus(readonly, id, TRUST);
      expect(status!.refusals).toEqual({ GRANT_UNAVAILABLE: 1, HANDLER_OUTPUT_INVALID: 1 });
      expect(status!.verification).toEqual({ verified: true, detail: null });
    });
  });

  describe('budgets, backpressure and fairness', () => {
    it('stops claiming with a RECORDED reason when the search-run budget is spent', async () => {
      const id = await started({
        searchGrantIds: [randomUUID(), randomUUID()],
        budgets: { maxSearchRuns: '1' },
      });
      const summary = await run(id, [nominate(['one-fict.nl'])]);
      expect(summary).toMatchObject({
        stopReason: 'BUDGET_EXHAUSTED',
        detail: 'maxSearchRuns',
        processed: 1,
      });
      const { rows } = await admin.query(
        'SELECT stop_reason, detail FROM acquisition_worker_stops',
      );
      expect(rows).toEqual([{ stop_reason: 'BUDGET_EXHAUSTED', detail: 'maxSearchRuns' }]);
      const status = await loadCampaignStatus(readonly, id, TRUST);
      expect(status!.budgets.maxSearchRuns).toEqual({ limit: 1, used: 1, remaining: 0 });
      // The parked NOMINATED child is not a worker stage of this campaign.
      expect(status!.stages.NOMINATED).toEqual({ PENDING: 1 });
    });

    it('refuses children beyond the work-item budget and the per-domain cap, and says so', async () => {
      const id = await started({
        searchGrantIds: [randomUUID()],
        budgets: { maxWorkItems: '4', maxItemsPerRegistrableDomain: '2' },
      });
      await run(id, [nominate(['a-fict.nl', 'a-fict.nl', 'a-fict.nl', 'b-fict.nl', 'c-fict.nl'])], {
        once: true,
      });
      const { rows } = await admin.query<{ produced: number; refusals: string[] }>(
        `SELECT cardinality(produced_child_ids) AS produced, child_refusals AS refusals
           FROM acquisition_work_outcomes`,
      );
      expect(rows).toEqual([
        { produced: 3, refusals: ['DOMAIN_CAP_REACHED', 'WORK_ITEM_BUDGET_EXHAUSTED'] },
      ]);
    });

    it('stops at the human backlog cap (backpressure)', async () => {
      const id = await started({
        searchGrantIds: [randomUUID(), randomUUID()],
        budgets: { maxAwaitingHumanBacklog: '1' },
      });
      const summary = await run(id, [
        handler('DISCOVERED', () => ({ kind: 'AWAITING_HUMAN', queue: 'EVIDENCE_REVIEW' })),
      ]);
      expect(summary).toMatchObject({ stopReason: 'BACKPRESSURE', processed: 1 });
      const status = await loadCampaignStatus(readonly, id, TRUST);
      expect(status!.awaitingHuman).toEqual({ EVIDENCE_REVIEW: 1 });
      expect(status!.stages.DISCOVERED).toEqual({ AWAITING_HUMAN: 1, PENDING: 1 });
    });

    it('serves registrable domains round-robin, deterministically', async () => {
      const id = await started({
        searchGrantIds: [randomUUID()],
        stages: ['DISCOVERED', 'NOMINATED'],
      });
      const order: (string | null)[] = [];
      const summary = await run(id, [
        nominate(['a-fict.nl', 'a-fict.nl', 'a-fict.nl', 'b-fict.nl', 'b-fict.nl', 'c-fict.nl']),
        handler('NOMINATED', (item) => {
          order.push(item.registrableDomain);
          return { kind: 'REFUSED', reason: 'DUPLICATE' };
        }),
      ]);
      expect(summary.stopReason).toBe('QUEUE_DRAINED');
      expect(order).toEqual([
        'a-fict.nl',
        'b-fict.nl',
        'c-fict.nl',
        'a-fict.nl',
        'b-fict.nl',
        'a-fict.nl',
      ]);
    });
  });

  describe('control: pause, resume, stop, emergency stop, graceful shutdown', () => {
    it('PAUSE stops claiming (and the database refuses a claim); RESUME continues', async () => {
      const id = await started({ searchGrantIds: [randomUUID()] });
      const auth = await authority(id);
      await seedCampaignSearchGrantRoots(worker, auth);
      await recordControlEvent(admin, { campaignId: id, action: 'PAUSE', actorKey: 'owner-cli' });
      expect((await run(id, [nominate([])])).stopReason).toBe('CAMPAIGN_PAUSED');
      const { rows } = await admin.query<{ id: string }>('SELECT id FROM acquisition_work_items');
      expect(
        await sqlstate(() =>
          claimSpecificWorkItem(worker, {
            campaignId: id,
            workItemId: rows[0]!.id,
            attemptNo: 1,
            workerId: 'test-worker-a',
            leaseSeconds: 60,
          }),
        ),
      ).toBe('23514');
      await recordControlEvent(
        admin,
        { campaignId: id, action: 'RESUME', actorKey: 'owner-cli' },
        { trust: TRUST },
      );
      const resumed = await run(id, [
        handler('DISCOVERED', () => ({ kind: 'REFUSED', reason: 'DUPLICATE' })),
      ]);
      expect(resumed).toMatchObject({ stopReason: 'QUEUE_DRAINED', processed: 1 });
    });

    it('STOP is terminal; EMERGENCY_STOP may escalate it; nothing follows', async () => {
      const id = await started({ searchGrantIds: [randomUUID()] });
      await recordControlEvent(admin, { campaignId: id, action: 'STOP', actorKey: 'owner-cli' });
      expect((await run(id, [nominate([])])).stopReason).toBe('CAMPAIGN_STOPPED');
      for (const action of ['RESUME', 'START', 'PAUSE'] as const) {
        await expect(
          recordControlEvent(
            admin,
            { campaignId: id, action, actorKey: 'owner-cli' },
            { trust: TRUST },
          ),
        ).rejects.toMatchObject({ code: 'CONTROL_TRANSITION_REFUSED' });
      }
      await recordControlEvent(admin, {
        campaignId: id,
        action: 'EMERGENCY_STOP',
        actorKey: 'owner-cli',
      });
      await expect(
        recordControlEvent(admin, {
          campaignId: id,
          action: 'EMERGENCY_STOP',
          actorKey: 'owner-cli',
        }),
      ).rejects.toMatchObject({ code: 'CONTROL_TRANSITION_REFUSED' });
      expect((await run(id, [nominate([])])).stopReason).toBe('CAMPAIGN_EMERGENCY_STOPPED');
    });

    it('EMERGENCY_STOP during a handler aborts it and records a refusal with no children', async () => {
      const id = await started({ searchGrantIds: [randomUUID()] });
      const summary = await run(id, [
        handler('DISCOVERED', async (_item, ctx) => {
          await recordControlEvent(admin, {
            campaignId: id,
            action: 'EMERGENCY_STOP',
            actorKey: 'owner-cli',
          });
          await new Promise<void>((resolve) =>
            ctx.signal.addEventListener('abort', () => resolve()),
          );
          return {
            kind: 'ADVANCED',
            next: 'NOMINATED',
            children: [{ subjectKind: 'NOMINATION', subjectId: randomUUID() }],
          };
        }),
      ]);
      expect(summary.stopReason).toBe('CAMPAIGN_EMERGENCY_STOPPED');
      const { rows } = await admin.query(
        'SELECT outcome, refusal_reason FROM acquisition_work_outcomes',
      );
      expect(rows).toEqual([
        { outcome: 'REFUSED_TERMINAL', refusal_reason: 'CAMPAIGN_EMERGENCY_STOPPED' },
      ]);
      expect(
        (await admin.query('SELECT count(*)::int AS n FROM acquisition_work_items')).rows[0].n,
      ).toBe(1);
    });

    it('a graceful abort finishes the current item, records its outcome, then stops', async () => {
      const id = await started({ searchGrantIds: [randomUUID(), randomUUID()] });
      const controller = new AbortController();
      const summary = await run(
        id,
        [
          handler('DISCOVERED', () => {
            controller.abort();
            return { kind: 'REFUSED', reason: 'DUPLICATE' };
          }),
        ],
        { signal: controller.signal },
      );
      expect(summary).toMatchObject({ stopReason: 'ABORTED', processed: 1 });
      expect(
        (await admin.query('SELECT count(*)::int AS n FROM acquisition_work_outcomes')).rows[0].n,
      ).toBe(1);
    });
  });

  describe('the human gate', () => {
    it('the worker parks IDENTITY_REVIEW as AWAITING_HUMAN and can never pass it; only the owner path releases', async () => {
      const id = await started({
        searchGrantIds: [randomUUID()],
        stages: ['DISCOVERED', 'NOMINATED', 'DEDUPLICATED', 'RESEARCH_PENDING', 'RESEARCHED'],
      });
      const subject = randomUUID();
      const handlers: StageHandler[] = [
        nominate(['subject-fict.nl']),
        handler('NOMINATED', () => ({ kind: 'ADVANCED', next: 'DEDUPLICATED' })),
        handler('DEDUPLICATED', (item) => ({
          kind: 'ADVANCED',
          next: 'RESEARCH_PENDING',
          children: [
            {
              subjectKind: 'DISCOVERY_SUBJECT',
              subjectId: subject,
              registrableDomain: item.registrableDomain,
            },
          ],
        })),
        handler('RESEARCH_PENDING', (_i, ctx) => {
          ctx.consume('researchRoots', 1);
          ctx.consume('gatewayRequests', 12);
          return { kind: 'ADVANCED', next: 'RESEARCHED' };
        }),
      ];
      // Stop just before the gate to try to pass it by hand.
      const before = await run(id, [
        ...handlers,
        handler('RESEARCHED', () => ({ kind: 'ADVANCED', next: 'IDENTITY_REVIEW' })),
      ]);
      expect(before.outcomes.AWAITING_HUMAN).toBe(1);
      expect(before.stopReason).toBe('QUEUE_DRAINED');
      const { rows: gate } = await admin.query<{ id: string; state: string; queue: string }>(
        `SELECT work_item_id AS id, state, human_queue AS queue FROM acquisition_work_item_states
          WHERE stage = 'IDENTITY_REVIEW'`,
      );
      expect(gate).toEqual([
        { id: gate[0]!.id, state: 'AWAITING_HUMAN', queue: 'OWNER_IDENTITY_REVIEW' },
      ]);
      expect(
        (
          await admin.query(
            `SELECT count(*)::int AS n FROM acquisition_work_items WHERE stage = 'ASSESSABLE'`,
          )
        ).rows[0].n,
      ).toBe(0);

      const releaseAs = (pool: pg.Pool) =>
        sqlstate(() =>
          pool.query(
            // WW E-W (migration 0024 queue shape): the child keeps its parent's domain.
            `INSERT INTO acquisition_work_items
               (campaign_id, stage, source_kind, subject_kind, subject_id, idempotency_key,
                parent_item_id, priority, registrable_domain)
             VALUES ($1, 'ASSESSABLE', 'SEARCH_GRANT', 'DISCOVERY_SUBJECT', $2::uuid,
                     'ASSESSABLE|DISCOVERY_SUBJECT:' || $2::text, $3, 600,
                     (SELECT registrable_domain FROM acquisition_work_items WHERE id = $3))`,
            [id, subject, gate[0]!.id],
          ),
        );
      expect(await releaseAs(worker)).toBe('42501');
      expect(await releaseAs(admin)).toBe('SUCCEEDED');

      const status = await loadCampaignStatus(readonly, id, TRUST);
      expect(status!.budgets.maxResearchRoots).toEqual({ limit: 10, used: 1, remaining: 9 });
      expect(status!.budgets.maxGatewayRequests).toEqual({ limit: 600, used: 12, remaining: 588 });
      expect(status!.lastAdvancedAt).not.toBeNull();
    });

    it('the database refuses anything but AWAITING_HUMAN for an identity-review claim', async () => {
      const id = await started({
        searchGrantIds: [randomUUID()],
        stages: ['DISCOVERED', 'NOMINATED', 'DEDUPLICATED', 'RESEARCH_PENDING', 'RESEARCHED'],
      });
      const subject = randomUUID();
      await run(
        id,
        [
          nominate(['gate-fict.nl']),
          handler('NOMINATED', () => ({
            kind: 'ADVANCED',
            next: 'DEDUPLICATED',
            children: [
              {
                subjectKind: 'DISCOVERY_SUBJECT',
                subjectId: subject,
                registrableDomain: 'gate-fict.nl',
              },
            ],
          })),
          handler('DEDUPLICATED', () => ({ kind: 'ADVANCED', next: 'RESEARCH_PENDING' })),
          handler('RESEARCH_PENDING', () => ({ kind: 'ADVANCED', next: 'RESEARCHED' })),
          handler('RESEARCHED', () => ({ kind: 'ADVANCED', next: 'IDENTITY_REVIEW' })),
        ],
        { maxItems: 5 },
      );
      const auth = await authority(id);
      const claimed = await claimNextWorkItem(worker, auth, {
        workerId: 'test-worker-a',
        leaseSeconds: 60,
      });
      expect(claimed.kind).toBe('CLAIMED');
      const claim = (claimed as { claim: ClaimedWork }).claim;
      expect(claim.item.stage).toBe('IDENTITY_REVIEW');
      const none = { searchRuns: 0, researchRoots: 0, gatewayRequests: 0 };
      for (const outcome of [
        { kind: 'ADVANCED', nextStage: 'ASSESSABLE', children: [] },
        { kind: 'REFUSED_TERMINAL', reason: 'DUPLICATE' },
        { kind: 'AWAITING_HUMAN', queue: 'EVIDENCE_REVIEW' },
      ] as const) {
        await expect(
          recordWorkOutcome(worker, claim, outcome, none, 'test-worker-a'),
        ).rejects.toMatchObject({
          code: '23514',
        });
      }
      const ok = await recordWorkOutcome(
        worker,
        claim,
        { kind: 'AWAITING_HUMAN', queue: 'OWNER_IDENTITY_REVIEW' },
        none,
        'test-worker-a',
      );
      expect(ok.recorded).toBe('AWAITING_HUMAN');
    });

    it('refuses a handler for the human gate before anything is claimed', async () => {
      const id = await started({ searchGrantIds: [randomUUID()] });
      await expect(
        run(id, [
          nominate([]),
          {
            stage: 'IDENTITY_REVIEW' as never,
            handle: async () => ({ kind: 'ADVANCED', next: 'ASSESSABLE' }),
          },
        ]),
      ).rejects.toBeInstanceOf(WorkerConfigRefusal);
      expect(
        (await admin.query('SELECT count(*)::int AS n FROM acquisition_work_claims')).rows[0].n,
      ).toBe(0);
    });
  });

  describe('owner-path roots and the CLI', () => {
    it('only the owner path may seed a link-out or seed-list root', async () => {
      const id = await started({ sourceKinds: ['SEED'], searchGrantIds: [] });
      expect(
        await enqueueOwnerRoot(admin, {
          campaignId: id,
          sourceKind: 'SEED',
          subjectId: randomUUID(),
        }),
      ).toMatchObject({
        kind: 'INSERTED',
      });
      // WW E-W (review P2-1): the store now refuses a non-owner session before
      // the database is asked; the database still refuses the worker by itself.
      await expect(
        enqueueOwnerRoot(worker, { campaignId: id, sourceKind: 'SEED', subjectId: randomUUID() }),
      ).rejects.toBeInstanceOf(OwnerPathRequired);
      const seed = randomUUID();
      expect(
        await sqlstate(() =>
          worker.query(
            `INSERT INTO acquisition_work_items
               (campaign_id, stage, source_kind, subject_kind, subject_id, idempotency_key, priority)
             VALUES ($1, 'DISCOVERED', 'SEED', 'SEED_LIST', $2::uuid,
                     'DISCOVERED|SEED_LIST:' || $2::text, 0)`,
            [id, seed],
          ),
        ),
      ).toBe('42501');
    });

    // WW E-W (ADR 0030): the production stage handlers are now wired, so the
    // CLI no longer refuses ACQUISITION_HANDLERS_NOT_WIRED for a listed stage;
    // the worker still claims NOTHING, because the campaign derives no
    // authority under the EMPTY operational trust set. The status is the
    // versioned nwf-pe.acquisition-status.v1 document, embedding E-Q's.
    it('the production worker claims nothing: the campaign does not verify in this build', async () => {
      const id = await record({ searchGrantIds: [randomUUID()] });
      const out: string[] = [];
      const code = await runAcquisitionCli(['worker', '--campaign-id', id, '--json'], {
        readonlyPool: () => readonlyPool(),
        workerPool: () => new pg.Pool({ connectionString: urlFor(WORKER_LOGIN), max: 2 }),
        out: (t) => out.push(t),
        err: () => undefined,
      });
      expect(code).toBe(0);
      expect(JSON.parse(out[0]!)).toMatchObject({
        outcome: 'STOPPED',
        summary: { stopReason: 'CAMPAIGN_UNVERIFIED', processed: 0 },
      });
      expect(
        (await admin.query('SELECT count(*)::int AS n FROM acquisition_work_claims')).rows[0].n,
      ).toBe(0);
      const status: string[] = [];
      expect(
        await runAcquisitionCli(['status', '--campaign-id', id, '--json'], {
          readonlyPool: () => readonlyPool(),
          out: (t) => status.push(t),
        }),
      ).toBe(0);
      expect(JSON.parse(status[0]!).status).toMatchObject({
        schema: 'nwf-pe.acquisition-status.v1',
        campaign: {
          controlState: 'NOT_STARTED',
          verified: false,
          verificationDetail: 'KEY_UNKNOWN',
        },
        queue: {
          controlState: 'NOT_STARTED',
          verification: { verified: false, detail: 'KEY_UNKNOWN' },
        },
      });
    });
  });
});

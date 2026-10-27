/**
 * WW E-W - regression tests for the independent review of the 0023 queue,
 * fixed in migration 0024 and the acquisition namespace (ADR 0030 s9):
 *
 *   P1-4  budgets: claim-time reservations the database checks against the
 *         signed budget; `consume` refuses beyond the claim's reservation; an
 *         outcome may not report more than was reserved; a claim with no
 *         outcome keeps its reservation as spend; lease heartbeats keep a
 *         long stage from being re-claimed, and a lapsed lease is lost.
 *   P2-1  the worker refuses a superuser / table-owner session.
 *   P2-2  every acquisition function pins its search path.
 *   P2-3  EMERGENCY_STOP is recorded while another session holds the
 *         campaign advisory lock.
 *   P2-6  queue shape: no root before START; one child below DISCOVERED;
 *         same subject for the same kind; the parent's domain is kept.
 *   P2-7  the outcome rule takes the campaign lock before the item lock.
 *   P2-10 the stored campaign's environment is checked against THIS
 *         database's own record, not against itself.
 *
 * TEST-ONLY keys, scripted handlers, a disposable database; nothing leaves
 * the process.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  LeaseLostError,
  WorkerConfigRefusal,
  claimNextWorkItem,
  deriveCampaignAuthority,
  enqueueOwnerRoot,
  extendClaimLease,
  loadCampaignUsage,
  recordCampaign,
  recordControlEvent,
  recordWorkOutcome,
  runWorker,
  seedCampaignSearchGrantRoots,
  verifyStoredCampaign,
  loadStoredCampaign,
  type ClaimedWork,
  type StageHandler,
  type StageOutcome,
} from '../../orgunits/acquisition/index.js';
import { claimSpecificWorkItem } from '../../orgunits/acquisition/store.js';
import { signedCampaign } from '../helpers/acquisitionCampaignFixtures.js';
import {
  createWiringHarness,
  truncateWiring,
  type WiringHarness,
} from '../helpers/acquisitionWiringHarness.js';
import { researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;
const FAST = { idleSleepMs: 10, idleTimeoutMs: 300, controlPollMs: 20 } as const;

async function sqlstate(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return String((err as { code?: string }).code);
  }
  return 'SUCCEEDED';
}

describeDb('WW E-W review fixes to the acquisition queue (integration)', () => {
  let h: WiringHarness;

  beforeAll(async () => {
    h = await createWiringHarness('acqfx');
  });
  afterAll(async () => {
    await truncateWiring(h.admin);
    await h.tearDown();
  });
  beforeEach(async () => {
    await truncateWiring(h.admin);
  });

  async function campaign(
    draft: { stages?: string[]; budgets?: Record<string, string>; sourceKinds?: string[] } = {},
    start = true,
  ): Promise<{ id: string; grant: string }> {
    const grant = randomUUID();
    const sourceKinds = draft.sourceKinds ?? ['SEARCH_GRANT'];
    const text = signedCampaign(h.campaignKey, {
      environmentId: h.environmentId,
      sourceKinds,
      searchGrantIds: sourceKinds.includes('SEARCH_GRANT') ? [grant] : [],
      stages: draft.stages ?? ['DISCOVERED', 'NOMINATED', 'DEDUPLICATED', 'RESEARCH_PENDING'],
      budgets: draft.budgets ?? {},
    });
    const r = await recordCampaign(
      h.admin,
      Buffer.from(text),
      { actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    if (start) {
      await recordControlEvent(
        h.admin,
        { campaignId: r.campaignId, action: 'START', actorKey: 'owner-cli' },
        { trust: h.campaignTrust },
      );
    }
    return { id: r.campaignId, grant };
  }

  const handler = (
    stage: StageHandler['stage'],
    fn: (...a: Parameters<StageHandler['handle']>) => Promise<StageOutcome> | StageOutcome,
  ): StageHandler => ({ stage, handle: async (item, ctx) => fn(item, ctx) });

  const nominate = (domains: string[]) =>
    handler('DISCOVERED', (_i, ctx) => {
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
    handlers: StageHandler[],
    extra: Partial<Parameters<typeof runWorker>[0]> = {},
  ) =>
    runWorker({
      pool: h.worker,
      campaignId: id,
      workerId: 'test-fix-worker',
      handlers,
      trust: h.campaignTrust,
      ...FAST,
      ...extra,
    });

  async function authority(id: string) {
    const d = await deriveCampaignAuthority(h.worker, id, { trust: h.campaignTrust });
    if (!d.ok) throw new Error(d.code);
    return d.authority;
  }

  // ------------------------------------------------------------------ P1-4

  it('P1-4: a claim reserves its stage spend, and the database refuses a reservation beyond the budget', async () => {
    const { id } = await campaign({ budgets: { maxSearchRuns: '1' } });
    const auth = await authority(id);
    await seedCampaignSearchGrantRoots(h.worker, auth);
    const claimed = await claimNextWorkItem(h.worker, auth, {
      workerId: 'test-fix-worker',
      leaseSeconds: 60,
    });
    expect(claimed.kind).toBe('CLAIMED');
    const claim = (claimed as { claim: ClaimedWork }).claim;
    expect(claim.reserved).toEqual({ searchRuns: 1, researchRoots: 0, gatewayRequests: 0 });
    // While the claim has no outcome its reservation is spend.
    expect((await loadCampaignUsage(h.admin, id)).searchRuns).toBe(1);
    // An outcome may not report more than was reserved.
    await expect(
      recordWorkOutcome(
        h.worker,
        claim,
        { kind: 'ADVANCED', nextStage: 'NOMINATED', children: [] },
        { searchRuns: 2, researchRoots: 0, gatewayRequests: 0 },
        'test-fix-worker',
      ),
    ).rejects.toMatchObject({ code: '23514' });
    // A forged reservation is refused by the database (not the stage's).
    const second = await campaign();
    const auth2 = await authority(second.id);
    await seedCampaignSearchGrantRoots(h.worker, auth2);
    const { rows } = await h.admin.query<{ id: string }>(
      'SELECT id FROM acquisition_work_items WHERE campaign_id = $1',
      [second.id],
    );
    const forged = (r: number) =>
      sqlstate(() =>
        h.worker.query(
          `INSERT INTO acquisition_work_claims
             (work_item_id, campaign_id, attempt_no, worker_id, lease_expires_at, reserved_search_runs)
           VALUES ($1, $2, 1, 'test-fix-worker', now() + interval '60 seconds', $3)`,
          [rows[0]!.id, second.id, r],
        ),
      );
    expect(await forged(0)).toBe('23514');
    // A claim without an outcome keeps counting: an exhausted budget is not re-spent after a crash.
    const crashedUsage = await loadCampaignUsage(h.admin, id);
    expect(crashedUsage.searchRuns).toBe(1);
  });

  it('P1-4: consume() refuses beyond the claim reservation; the item is retried, not over-spent', async () => {
    const { id } = await campaign({ budgets: { maxGatewayRequests: '600' } });
    const subject = randomUUID();
    const summary = await run(
      id,
      [
        nominate(['budget-fict.nl']),
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
          expect(ctx.remaining).toEqual({ searchRuns: 0, researchRoots: 1, gatewayRequests: 60 });
          ctx.consume('gatewayRequests', 61); // beyond the reservation: throws
          return { kind: 'ADVANCED', next: 'RESEARCHED' };
        }),
      ],
      { maxItems: 4 },
    );
    expect(summary.outcomes.RETRY_SCHEDULED).toBe(1);
    const { rows } = await h.admin.query<{ g: number }>(
      `SELECT COALESCE(sum(gateway_requests_consumed), 0)::int AS g FROM acquisition_work_outcomes`,
    );
    expect(rows[0]!.g).toBe(0);
  });

  it('P1-4: a heartbeat keeps a long stage leased; a lapsed lease is lost and cannot be extended', async () => {
    const { id } = await campaign({ stages: ['DISCOVERED'] });
    const summary = await run(
      id,
      [
        handler('DISCOVERED', async (_i, ctx) => {
          ctx.consume('searchRuns', 1);
          await new Promise((r) => setTimeout(r, 2500)); // longer than the 3 s lease's heartbeat third
          return { kind: 'ADVANCED', next: 'NOMINATED', children: [] };
        }),
      ],
      { leaseSeconds: 3, once: true },
    );
    expect(summary.outcomes.ADVANCED).toBe(1);
    const { rows } = await h.admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM acquisition_claim_lease_extensions',
    );
    expect(rows[0]!.n).toBeGreaterThanOrEqual(1);

    // A lapsed claim: extension refused as LEASE_LOST.
    const other = await campaign({ stages: ['DISCOVERED'] });
    const auth = await authority(other.id);
    await seedCampaignSearchGrantRoots(h.worker, auth);
    const claimed = await claimNextWorkItem(h.worker, auth, {
      workerId: 'test-fix-worker',
      leaseSeconds: 1,
    });
    const claim = (claimed as { claim: ClaimedWork }).claim;
    await new Promise((r) => setTimeout(r, 1200));
    await expect(extendClaimLease(h.worker, claim, 60)).rejects.toBeInstanceOf(LeaseLostError);
  });

  // ------------------------------------------------------------------ P2-1

  it('P2-1: the worker refuses a superuser or table-owner session before anything', async () => {
    const { id } = await campaign();
    await expect(run(id, [nominate([])], { pool: h.admin })).rejects.toMatchObject({
      code: 'WORKER_SESSION_REFUSED',
    });
    await expect(run(id, [nominate([])], { pool: h.admin })).rejects.toBeInstanceOf(
      WorkerConfigRefusal,
    );
    expect(
      (await h.admin.query<{ n: number }>('SELECT count(*)::int AS n FROM acquisition_work_claims'))
        .rows[0]!.n,
    ).toBe(0);
  });

  // ------------------------------------------------------------------ P2-2 / P2-7

  it('P2-2/P2-7: every acquisition function pins its search path; the outcome rule locks the campaign first', async () => {
    const { rows } = await h.admin.query<{ name: string; config: string[] | null; src: string }>(
      `SELECT p.proname AS name, p.proconfig AS config, p.prosrc AS src
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (p.proname LIKE 'acquisition\\_%' OR p.proname = 'subject_research_admission_campaign_verify')
        ORDER BY 1`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(18);
    for (const r of rows) {
      expect(r.config, r.name).toEqual(['search_path=public, pg_catalog, pg_temp']);
    }
    const owner = rows.find((r) => r.name === 'acquisition_is_owner_path')!;
    expect(owner.src).toContain("'public.acquisition_campaigns'::regclass");
    const outcome = rows.find((r) => r.name === 'acquisition_outcome_verify_insert')!.src;
    expect(outcome.indexOf('acquisition_campaign_lock_key')).toBeGreaterThan(0);
    expect(outcome.indexOf('acquisition_campaign_lock_key')).toBeLessThan(
      outcome.indexOf('acquisition_item_lock_key'),
    );
  });

  // ------------------------------------------------------------------ P2-3

  it('P2-3: EMERGENCY_STOP is recorded while another session holds the campaign advisory lock', async () => {
    const { id } = await campaign();
    const holder = await h.worker.connect();
    try {
      await holder.query('SELECT pg_advisory_lock(acquisition_campaign_lock_key($1))', [id]);
      const stop = recordControlEvent(h.admin, {
        campaignId: id,
        action: 'EMERGENCY_STOP',
        actorKey: 'owner-cli',
      });
      const timeout = new Promise<'TIMEOUT'>((r) => setTimeout(() => r('TIMEOUT'), 5000));
      const result = await Promise.race([stop, timeout]);
      expect(result).not.toBe('TIMEOUT');
      expect(result).toMatchObject({ action: 'EMERGENCY_STOP', previousState: 'RUNNING' });
    } finally {
      await holder.query('SELECT pg_advisory_unlock_all()');
      holder.release();
    }
  });

  // ------------------------------------------------------------------ P2-6

  it('P2-6: no root before START; below DISCOVERED one child, same subject, same domain', async () => {
    const notStarted = await campaign({ sourceKinds: ['SEED'] }, false);
    expect(
      await sqlstate(() =>
        enqueueOwnerRoot(h.admin, {
          campaignId: notStarted.id,
          sourceKind: 'SEED',
          subjectId: randomUUID(),
        }),
      ),
    ).toBe('23514');

    const { id } = await campaign({ stages: ['DISCOVERED', 'NOMINATED'] });
    await run(
      id,
      [
        nominate(['shape-fict.nl']),
        handler('NOMINATED', () => ({ kind: 'REFUSED', reason: 'DUPLICATE' })),
      ],
      { once: true },
    );
    const { rows: noms } = await h.admin.query<{ id: string; subject: string }>(
      `SELECT id, subject_id AS subject FROM acquisition_work_items
        WHERE campaign_id = $1 AND stage = 'NOMINATED'`,
      [id],
    );
    await claimSpecificWorkItem(h.worker, {
      campaignId: id,
      workItemId: noms[0]!.id,
      attemptNo: 1,
      workerId: 'test-fix-worker',
      leaseSeconds: 60,
    });
    const child = (subject: string, domain: string | null) =>
      sqlstate(() =>
        h.admin.query(
          `INSERT INTO acquisition_work_items
             (campaign_id, stage, source_kind, subject_kind, subject_id, idempotency_key,
              parent_item_id, priority, registrable_domain)
           VALUES ($1, 'DEDUPLICATED', 'SEARCH_GRANT', 'NOMINATION', $2::uuid,
                   'DEDUPLICATED|NOMINATION:' || $2::text, $3, 200, $4)`,
          [id, subject, noms[0]!.id, domain],
        ),
      );
    expect(await child(noms[0]!.subject, null)).toBe('23514'); // NULL escape from the domain cap
    expect(await child(randomUUID(), 'shape-fict.nl')).toBe('23514'); // a different nomination
    expect(await child(noms[0]!.subject, 'shape-fict.nl')).toBe('SUCCEEDED');
    expect(await child(randomUUID(), 'shape-fict.nl')).toBe('23514'); // a second child
  });

  it('P2-6: the worker refuses a handler output that breaks the queue shape', async () => {
    const { id } = await campaign();
    const summary = await run(id, [
      nominate(['out-fict.nl']),
      handler('NOMINATED', (item) => ({
        kind: 'ADVANCED',
        next: 'DEDUPLICATED',
        children: [
          {
            subjectKind: 'NOMINATION',
            subjectId: item.subjectId,
            registrableDomain: 'elsewhere-fict.nl',
          },
        ],
      })),
      handler('DEDUPLICATED', () => ({ kind: 'ADVANCED', next: 'RESEARCH_PENDING' })),
      handler('RESEARCH_PENDING', () => ({ kind: 'ADVANCED', next: 'RESEARCHED' })),
    ]);
    expect(summary.outcomes.REFUSED_TERMINAL).toBe(1);
    const { rows } = await h.admin.query<{ reason: string }>(
      `SELECT refusal_reason AS reason FROM acquisition_work_item_states
        WHERE campaign_id = $1 AND stage = 'NOMINATED'`,
      [id],
    );
    expect(rows).toEqual([{ reason: 'HANDLER_OUTPUT_INVALID' }]);
  });

  // ------------------------------------------------------------------ P2-10

  it("P2-10: a stored campaign is checked against THIS database's environment record", async () => {
    const { id } = await campaign();
    const stored = (await loadStoredCampaign(h.worker, id))!;
    expect(stored.databaseEnvironmentId).toBe(h.environmentId);
    expect(verifyStoredCampaign(stored, h.campaignTrust)).toMatchObject({ ok: true });
    // A different environment record (a database that is not the signing one).
    expect(
      verifyStoredCampaign({ ...stored, databaseEnvironmentId: randomUUID() }, h.campaignTrust),
    ).toEqual({ ok: false, detail: 'ENVIRONMENT_MISMATCH' });
    expect(
      verifyStoredCampaign({ ...stored, databaseEnvironmentId: null }, h.campaignTrust),
    ).toEqual({ ok: false, detail: 'ENVIRONMENT_MISMATCH' });
  });
});

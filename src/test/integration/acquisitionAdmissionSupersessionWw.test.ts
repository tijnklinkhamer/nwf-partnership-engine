/**
 * WW acceptance (migration 0028) - a CAMPAIGN admission that its own item could not use is
 * SUPERSEDED, never retried forever, against a DISPOSABLE PostgreSQL.
 *
 * The defect the Mac runtime full-system test found: an attempt records its CAMPAIGN
 * admission and dies before the run starts (a PAUSE, a crash); the registry changes (the
 * OWNER's identity review); the next attempt reuses the admission, which can never verify
 * again (ROOT_SUBJECT_ADMISSION_STALE), and 0026 refuses a second live admission. Now the
 * worker supersedes the unused admission and admits afresh, counted against the signed
 * research-root budget; the database confines that act to exactly this case.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  recordCampaign,
  recordControlEvent,
  runWorker,
  WORKER_STAGES,
} from '../../orgunits/acquisition/index.js';
import { claimSpecificWorkItem } from '../../orgunits/acquisition/store.js';
import type { StageHandlerContext, WorkItemView } from '../../orgunits/acquisition/index.js';
import { createHostCircuitBreaker } from '../../orgunits/orchestrator/circuitBreaker.js';
import type { RequestPlan, TransportOutcome } from '../../orgunits/web/gateway.js';
import { createStageHandlers } from '../../orgunits/acquisitionWiring/index.js';
import {
  recordCampaignAdmission,
  supersedeCampaignAdmission,
} from '../../orgunits/acquisitionWiring/records.js';
import { admissionReadOf } from '../../orgunits/acquisitionWiring/registryBridge.js';
import { loadEvaluationCohortRegistry } from '../../orgunits/classify/evaluationCohortGuard.js';
import { protectedRegistryDigest } from '../../orgunits/subjectAdmission/registryDigest.js';
import { signedCampaign } from '../helpers/acquisitionCampaignFixtures.js';
import {
  SEARCH_RESULTS,
  SITES,
  createWiringHarness,
  fakeSdk,
  researchTransport,
  truncateWiring,
  type WiringHarness,
} from '../helpers/acquisitionWiringHarness.js';
import { researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;
const FAST = { idleSleepMs: 10, idleTimeoutMs: 300, controlPollMs: 20, leaseSeconds: 120 } as const;

describeDb('WW 0028: a stale, unused CAMPAIGN admission is superseded (integration)', () => {
  let h: WiringHarness;
  beforeAll(async () => {
    h = await createWiringHarness('acqsup');
    await truncateWiring(h.admin);
  });
  afterAll(async () => {
    await truncateWiring(h.admin);
    await h.tearDown();
  });

  const count = async (sql: string, params: unknown[] = []) =>
    (await h.admin.query<{ n: number }>(sql, params)).rows[0]!.n;

  it('an attempt dies after admitting; the registry changes; the retry supersedes and researches', async () => {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const { campaignId } = await recordCampaign(
      h.admin,
      Buffer.from(
        signedCampaign(h.campaignKey, {
          environmentId: h.environmentId,
          geographies: ['JP'],
          sourceKinds: ['SEARCH_GRANT', 'LINK_OUT'],
          stages: [...WORKER_STAGES],
          searchGrantIds: [grantId],
          budgets: { maxConcurrency: '1' },
        }),
      ),
      { actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    await recordControlEvent(
      h.admin,
      { campaignId, action: 'START', actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    const sdk = fakeSdk(SEARCH_RESULTS);
    const transport = researchTransport();
    const work = (extra: Partial<Parameters<typeof runWorker>[0]> = {}) =>
      runWorker({
        pool: h.worker,
        campaignId,
        workerId: 'test-supersession-worker',
        handlers: createStageHandlers(h.deps(sdk, transport)),
        trust: h.campaignTrust,
        ...FAST,
        ...extra,
      });

    // Advance until one RESEARCH_PENDING item waits.
    const pendingItem = async () =>
      (
        await h.admin.query<{ id: string; subject: string; domain: string }>(
          `SELECT work_item_id AS id, subject_id AS subject, registrable_domain AS domain
             FROM acquisition_work_item_states
            WHERE campaign_id = $1 AND stage = 'RESEARCH_PENDING' AND state = 'PENDING'
            ORDER BY created_at LIMIT 1`,
          [campaignId],
        )
      ).rows[0];
    let pending = await pendingItem();
    while (pending === undefined) {
      await work({ once: true });
      pending = await pendingItem();
    }

    // Attempt 1 records the CAMPAIGN admission, exactly as the handler does, and dies (no
    // run, no outcome; the lease lapses).
    await claimSpecificWorkItem(h.worker, {
      campaignId,
      workItemId: pending.id,
      attemptNo: 1,
      workerId: 'test-dead-worker',
      leaseSeconds: 1,
    });
    const { rows: claim } = await h.admin.query<{ id: string; url: string }>(
      `SELECT c.id, c.website_url AS url FROM discovery_subject_identity_claims c
        WHERE c.subject_id = $1 AND c.claim_kind = 'PUBLIC_WEBSITE' ORDER BY c.created_at LIMIT 1`,
      [pending.subject],
    );
    const cohort = loadEvaluationCohortRegistry();
    if (!cohort.ok) throw new Error('cohort registry not loadable in this test');
    const snapshot = (await admissionReadOf(h.readonly, pending.subject))!;
    const stale = await recordCampaignAdmission(h.worker, {
      item: {
        id: pending.id,
        campaignId,
        stage: 'RESEARCH_PENDING',
        sourceKind: 'SEARCH_GRANT',
        subjectKind: 'DISCOVERY_SUBJECT',
        subjectId: pending.subject,
        registrableDomain: pending.domain,
        parentItemId: null,
        priority: 300,
        idempotencyKey: `RESEARCH_PENDING|DISCOVERY_SUBJECT:${pending.subject}`,
      },
      subjectId: pending.subject,
      identityClaimId: claim[0]!.id,
      websiteUrl: claim[0]!.url,
      trustScope: 'TEST_ONLY',
      subjectStateDigest: snapshot.subjectStateDigest,
      protectedRegistryDigest: protectedRegistryDigest(cohort.registry),
      registryFingerprint: snapshot.registryFingerprint,
    });
    // While the attempt is still in flight, the worker may NOT supersede an admission of
    // its own current attempt.
    await expect(supersedeCampaignAdmission(h.worker, stale)).rejects.toThrow(
      /EARLIER attempt|CAMPAIGN_ADMISSION_REFUSED/,
    );
    await new Promise((r) => setTimeout(r, 1200));

    // The registry changes (another subject is recorded on the owner path).
    await h.admin.query(
      `INSERT INTO discovery_subjects (registered_kind, registered_by_actor_key)
       VALUES ('UNCERTAIN', 'owner-cli')`,
    );

    // The worker retries: it supersedes the stale admission and researches under a new one.
    expect((await work()).stopReason).toBe('QUEUE_DRAINED');
    const { rows: admissions } = await h.admin.query<{ id: string; reason: string | null }>(
      `SELECT a.id, v.reason FROM subject_research_admissions a
         LEFT JOIN subject_research_admission_revocations v ON v.admission_id = a.id
        WHERE a.campaign_work_item_id = $1 ORDER BY a.admitted_at`,
      [pending.id],
    );
    expect(admissions).toEqual([
      { id: stale, reason: 'CAMPAIGN_ATTEMPT_SUPERSEDED' },
      { id: expect.any(String), reason: null },
    ]);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM orgunit_research_runs
          WHERE root_scope = 'subject_admission:' || $1`,
        [admissions[1]!.id],
      ),
    ).toBe(1);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM acquisition_work_item_states
          WHERE campaign_id = $1 AND subject_id = $2 AND stage = 'IDENTITY_REVIEW'`,
        [campaignId, pending.subject],
      ),
    ).toBe(1);

    // The worker can never supersede an admission that has a run, a non-CAMPAIGN one, or
    // with any other reason or actor key.
    await expect(supersedeCampaignAdmission(h.worker, admissions[1]!.id)).rejects.toThrow(
      /CAMPAIGN_ADMISSION_REFUSED/,
    );
    await expect(
      h.worker.query(
        `INSERT INTO subject_research_admission_revocations (admission_id, actor_key, reason)
         VALUES ($1, 'acquisition-worker', 'because')`,
        [admissions[1]!.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  }, 120_000);

  it('a PAUSE cuts a run off before its first page: the item is retried, and the retry re-runs', async () => {
    await truncateWiring(h.admin);
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const { campaignId } = await recordCampaign(
      h.admin,
      Buffer.from(
        signedCampaign(h.campaignKey, {
          environmentId: h.environmentId,
          geographies: ['JP'],
          sourceKinds: ['SEARCH_GRANT', 'LINK_OUT'],
          stages: [...WORKER_STAGES],
          searchGrantIds: [grantId],
          budgets: { maxConcurrency: '1' },
        }),
      ),
      { actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    await recordControlEvent(
      h.admin,
      { campaignId, action: 'START', actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    const sdk = fakeSdk(SEARCH_RESULTS);
    const transport = researchTransport();
    const work = (extra: Partial<Parameters<typeof runWorker>[0]> = {}) =>
      runWorker({
        pool: h.worker,
        campaignId,
        workerId: 'test-pause-worker',
        handlers: createStageHandlers(h.deps(sdk, transport)),
        trust: h.campaignTrust,
        ...FAST,
        ...extra,
      });
    const pendingOf = async () =>
      (
        await h.admin.query<{ id: string; subject: string; domain: string }>(
          `SELECT work_item_id AS id, subject_id AS subject, registrable_domain AS domain
             FROM acquisition_work_item_states
            WHERE campaign_id = $1 AND stage = 'RESEARCH_PENDING' AND state = 'PENDING'
              AND registrable_domain = 'tandem-assoc-fict.jp'`,
          [campaignId],
        )
      ).rows[0];
    let pending = await pendingOf();
    while (pending === undefined) {
      await work({ once: true });
      pending = await pendingOf();
    }
    const item: WorkItemView = {
      id: pending.id,
      campaignId,
      stage: 'RESEARCH_PENDING',
      sourceKind: 'SEARCH_GRANT',
      subjectKind: 'DISCOVERY_SUBJECT',
      subjectId: pending.subject,
      registrableDomain: pending.domain,
      parentItemId: null,
      priority: 300,
      idempotencyKey: `RESEARCH_PENDING|DISCOVERY_SUBJECT:${pending.subject}`,
    };
    const ctxOf = (attemptNo: number): StageHandlerContext => ({
      campaign: {
        campaignId,
        campaignKey: 'x',
        scope: {
          geographies: ['JP'],
          searchGrantIds: [grantId],
          sourceKinds: ['SEARCH_GRANT', 'LINK_OUT'],
          stages: [...WORKER_STAGES],
          linkOutMaxHops: 1,
        },
        budgets: {} as never,
      },
      attemptNo,
      remaining: { searchRuns: 0, researchRoots: 2, gatewayRequests: 60 },
      consume: () => undefined,
      signal: new AbortController().signal,
      clock: { now: () => Date.now(), sleep: () => Promise.resolve() },
      circuit: createHostCircuitBreaker(),
    });

    // Attempt 1: the OWNER pauses while the association's robots.txt is being fetched, so
    // the run's next request (its first page) is refused CAMPAIGN_NOT_RUNNING.
    let paused = false;
    const pausing = researchTransport();
    const execute = pausing.execute.bind(pausing);
    pausing.execute = async (plan: RequestPlan): Promise<TransportOutcome> => {
      if (!paused && plan.url === `${SITES.association}robots.txt`) {
        paused = true;
        await recordControlEvent(
          h.admin,
          { campaignId, action: 'PAUSE', actorKey: 'owner-cli' },
          { trust: h.campaignTrust },
        );
      }
      return execute(plan);
    };
    await claimSpecificWorkItem(h.worker, {
      campaignId,
      workItemId: pending.id,
      attemptNo: 1,
      workerId: 'test-pause-worker',
      leaseSeconds: 2,
    });
    const handlerOf = (t: typeof transport) =>
      createStageHandlers(h.deps(sdk, t)).find((x) => x.stage === 'RESEARCH_PENDING')!;
    expect(await handlerOf(pausing).handle(item, ctxOf(1))).toEqual({
      kind: 'RETRY',
      reason: 'DEPENDENCY_NOT_READY',
      retryable: true,
    });
    expect(paused).toBe(true);
    const pagesOf = (admissionId: string) =>
      count(
        `SELECT count(*)::int AS n FROM orgunit_page_evidence p
           JOIN orgunit_fetch_observations f ON f.id = p.fetch_observation_id
           JOIN orgunit_research_runs r ON r.id = f.run_id
          WHERE r.root_scope = 'subject_admission:' || $1`,
        [admissionId],
      );
    const { rows: first } = await h.admin.query<{ id: string }>(
      `SELECT id FROM subject_research_admissions WHERE campaign_work_item_id = $1`,
      [pending.id],
    );
    expect(first).toHaveLength(1);
    expect(await pagesOf(first[0]!.id)).toBe(0);

    // RESUME; attempt 2 (the queue would claim it after its backoff): the empty run is
    // superseded and the association is researched under a fresh admission.
    await recordControlEvent(
      h.admin,
      { campaignId, action: 'RESUME', actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    await new Promise((r) => setTimeout(r, 2100));
    await claimSpecificWorkItem(h.worker, {
      campaignId,
      workItemId: pending.id,
      attemptNo: 2,
      workerId: 'test-pause-worker',
      leaseSeconds: 60,
    });
    expect(await handlerOf(researchTransport()).handle(item, ctxOf(2))).toEqual({
      kind: 'ADVANCED',
      next: 'RESEARCHED',
    });
    const { rows: all } = await h.admin.query<{ id: string; reason: string | null }>(
      `SELECT a.id, v.reason FROM subject_research_admissions a
         LEFT JOIN subject_research_admission_revocations v ON v.admission_id = a.id
        WHERE a.campaign_work_item_id = $1 ORDER BY a.admitted_at`,
      [pending.id],
    );
    expect(all).toEqual([
      { id: first[0]!.id, reason: 'CAMPAIGN_ATTEMPT_SUPERSEDED' },
      { id: expect.any(String), reason: null },
    ]);
    expect(await pagesOf(all[1]!.id)).toBeGreaterThan(0);
  }, 120_000);
});

/**
 * WW H-ACQ - regression tests for the hardening of campaign research
 * admission and the acquisition wiring (migration 0026, ADR 0030 s13),
 * against a DISPOSABLE PostgreSQL. Each test reproduces the attack or the
 * failure an independent review found and proves it is now refused.
 *
 * Synthetic only: TEST-ONLY campaign and review keys, a fake Agent SDK, a
 * scripted research transport, fictitious `-fict` domains. Nothing leaves the
 * process.
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Before anything reads `env()`: point the CLI's PRODUCTION research variable
// at the TEST database (the mechanism subjectResearchExecutionL1 documents).
if (process.env.DATABASE_URL_RESEARCH_TEST) {
  process.env.DATABASE_URL_RESEARCH = process.env.DATABASE_URL_RESEARCH_TEST;
}

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import { runOrgunitsSubjectsResearch } from '../../cli/commands/orgunitsSubjects.js';
import {
  claimSpecificWorkItem,
  enqueueCampaignLinkOutRoot,
  seedCampaignSearchGrantRoots,
} from '../../orgunits/acquisition/store.js';
import {
  deriveCampaignAuthority,
  recordCampaign,
  recordControlEvent,
  runWorker,
  WORKER_STAGES,
  type StageHandler,
} from '../../orgunits/acquisition/index.js';
import {
  campaignSubjectIdOf,
  createStageHandlers,
} from '../../orgunits/acquisitionWiring/index.js';
import { admissibleNominationsOfGrantedRun } from '../../orgunits/acquisitionWiring/discover.js';
import { startGrantedRun } from '../../orgunits/sourceDiscovery/grantStore.js';
import { inSourceDiscoveryTransaction } from '../../orgunits/sourceDiscovery/store.js';
import { recordCampaignAdmission } from '../../orgunits/acquisitionWiring/records.js';
import { admissionReadOf } from '../../orgunits/acquisitionWiring/registryBridge.js';
import { startSubjectRun } from '../../orgunits/orchestrator/run.js';
import { protectedRegistryDigest } from '../../orgunits/subjectAdmission/registryDigest.js';
import { verifySubjectAdmission } from '../../orgunits/subjectRun/admission.js';
import { resolveRoot, WebGatewayRefusal } from '../../orgunits/web/authority.js';
import type { RequestPlan, TransportOutcome } from '../../orgunits/web/gateway.js';
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
import {
  ALLOW_ALL,
  ScriptedTransport,
  html,
  page,
  response,
} from '../helpers/relSubjectHarness.js';
import { researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;
const FAST = { idleSleepMs: 10, idleTimeoutMs: 300, controlPollMs: 20, leaseSeconds: 120 } as const;
const ALL_STAGES = [...WORKER_STAGES];
const SECOND_HOP = 'https://www.second-hop-fict.jp/';

/** A transport that runs `onFirstPage` before answering the first ordinary page request. */
class TrippingTransport extends ScriptedTransport {
  private tripped = false;
  constructor(private readonly onFirstPage: () => Promise<void>) {
    super();
  }
  override async execute(plan: RequestPlan): Promise<TransportOutcome> {
    if (!this.tripped && !plan.url.endsWith('/robots.txt')) {
      this.tripped = true;
      await this.onFirstPage();
    }
    return super.execute(plan);
  }
}

describeDb('WW H-ACQ acquisition hardening (integration)', () => {
  let h: WiringHarness;

  beforeAll(async () => {
    h = await createWiringHarness('hacq');
  });
  afterAll(async () => {
    await truncateWiring(h.admin);
    await h.tearDown();
  });
  beforeEach(async () => {
    await truncateWiring(h.admin);
  });

  async function campaign(
    draft: {
      grantIds: string[];
      stages?: string[];
      budgets?: Record<string, string>;
      linkOutMaxHops?: string;
    },
    start = true,
  ): Promise<string> {
    const text = signedCampaign(h.campaignKey, {
      environmentId: h.environmentId,
      geographies: ['JP'],
      sourceKinds: ['SEARCH_GRANT', 'LINK_OUT'],
      stages: draft.stages ?? ALL_STAGES,
      searchGrantIds: draft.grantIds,
      budgets: { maxConcurrency: '1', ...draft.budgets },
      ...(draft.linkOutMaxHops !== undefined ? { linkOutMaxHops: draft.linkOutMaxHops } : {}),
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
    return r.campaignId;
  }

  const work = (
    campaignId: string,
    transport: ScriptedTransport = researchTransport(),
    extra: Partial<Parameters<typeof runWorker>[0]> = {},
    handlers?: readonly StageHandler[],
  ) =>
    runWorker({
      pool: h.worker,
      campaignId,
      workerId: 'test-hacq-worker',
      handlers: handlers ?? createStageHandlers(h.deps(fakeSdk(SEARCH_RESULTS), transport)),
      trust: h.campaignTrust,
      ...FAST,
      ...extra,
    });

  async function states(campaignId: string) {
    const { rows } = await h.admin.query<{
      id: string;
      stage: string;
      state: string;
      domain: string | null;
      subject: string;
      source: string;
      reason: string | null;
    }>(
      `SELECT work_item_id AS id, stage, state, registrable_domain AS domain, subject_id AS subject,
              source_kind AS source,
              COALESCE(refusal_reason, human_queue, retry_reason, failure_reason) AS reason
         FROM acquisition_work_item_states WHERE campaign_id = $1
        ORDER BY created_at, stage, registrable_domain`,
      [campaignId],
    );
    return rows;
  }

  const count = async (sql: string, params: unknown[] = []): Promise<number> =>
    (await h.admin.query<{ n: number }>(sql, params)).rows[0]!.n;

  const sqlstate = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn();
      return 'SUCCEEDED';
    } catch (error) {
      return (error as { code?: string }).code ?? String(error);
    }
  };

  /**
   * Drives the pipeline one item at a time until a RESEARCH_PENDING item is
   * PENDING, then claims it by hand for `leaseSeconds` and records its
   * CAMPAIGN admission exactly as the research handler does - without
   * researching. Returns the admission, the item and the subject.
   */
  async function admittedInFlight(campaignId: string, leaseSeconds = 300) {
    let pending = (await states(campaignId)).find(
      (s) => s.stage === 'RESEARCH_PENDING' && s.state === 'PENDING',
    );
    while (pending === undefined) {
      await work(campaignId, researchTransport(), { once: true });
      pending = (await states(campaignId)).find(
        (s) => s.stage === 'RESEARCH_PENDING' && s.state === 'PENDING',
      );
    }
    await claimSpecificWorkItem(h.worker, {
      campaignId,
      workItemId: pending.id,
      attemptNo: 1,
      workerId: 'test-hacq-hand',
      leaseSeconds,
    });
    const { rows: claim } = await h.readonly.query<{ id: string; url: string }>(
      `SELECT id, website_url AS url FROM discovery_subject_identity_claims
        WHERE subject_id = $1 AND claim_kind = 'PUBLIC_WEBSITE'`,
      [pending.subject],
    );
    const snapshot = (await admissionReadOf(h.readonly, pending.subject))!;
    const cohort = h.loadCohortRegistry();
    if (!cohort.ok) throw new Error('cohort');
    const admissionId = await recordCampaignAdmission(h.worker, {
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
    return { admissionId, itemId: pending.id, subjectId: pending.subject };
  }

  const refusalOf = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn();
      return 'RESOLVED';
    } catch (error) {
      if (error instanceof WebGatewayRefusal) return error.reason;
      throw error;
    }
  };

  // ---------------------------------------------------------------- P1-1

  it('P1-1: the standalone research CLI refuses a live CAMPAIGN admission, in both modes', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    const { subjectId } = await admittedInFlight(id);
    // The admission is live and inside its campaign: the resolver accepts it.
    const verified = await verifySubjectAdmission(h.research, subjectId, {
      loadCohortRegistry: h.loadCohortRegistry,
    });
    expect(verified.outcome).toBe('VERIFIED');

    const transport = researchTransport();
    for (const execute of [false, true]) {
      const chunks: string[] = [];
      const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        chunks.push(String(chunk));
        return true;
      });
      let code: number;
      try {
        code = await runOrgunitsSubjectsResearch(
          { subjectId, execute, json: true },
          { transport, loadCohortRegistry: h.loadCohortRegistry },
        );
      } finally {
        spy.mockRestore();
      }
      expect(code).toBe(1);
      expect(JSON.parse(chunks.join(''))).toMatchObject({
        admission: 'REFUSED',
        refusal: { code: 'CAMPAIGN_ADMISSION_NOT_STANDALONE' },
      });
    }
    expect(transport.requestedUrls).toEqual([]);
    expect(transport.resolvedHosts).toEqual([]);
    expect(await count(`SELECT count(*)::int AS n FROM orgunit_research_runs`)).toBe(0);
  });

  it('P1-1: outside a RUNNING campaign or an in-flight item the resolver refuses the admission', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    const { admissionId } = await admittedInFlight(id, 2);
    const ref = { kind: 'SUBJECT_ADMISSION', admissionId } as const;
    expect(await refusalOf(() => resolveRoot(h.research, ref))).toBe('RESOLVED');
    // The attempt's lease lapses (the worker died): nobody may use it now.
    await new Promise((r) => setTimeout(r, 2300));
    expect(await refusalOf(() => resolveRoot(h.research, ref))).toBe(
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_ITEM_NOT_IN_FLIGHT',
    );
    // And a run row cannot be started for it either (database, research role).
    expect(
      await sqlstate(() => startSubjectRun(h.research, { networkVantage: 'test', admissionId })),
    ).toBe('23514');
  });

  it('P1-1: EMERGENCY_STOP refuses the admission even while its item is in flight', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    const { admissionId } = await admittedInFlight(id);
    const ref = { kind: 'SUBJECT_ADMISSION', admissionId } as const;
    expect(await refusalOf(() => resolveRoot(h.research, ref))).toBe('RESOLVED');
    await recordControlEvent(h.admin, {
      campaignId: id,
      action: 'EMERGENCY_STOP',
      actorKey: 'owner-cli',
    });
    expect(await refusalOf(() => resolveRoot(h.research, ref))).toBe(
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_NOT_RUNNING',
    );
  });

  it('P1-1: exactly one run per CAMPAIGN admission; a second run is refused before any request', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    const { admissionId } = await admittedInFlight(id);
    const ref = { kind: 'SUBJECT_ADMISSION', admissionId } as const;
    const first = await startSubjectRun(h.research, { networkVantage: 'test', admissionId });
    expect(await refusalOf(() => resolveRoot(h.research, ref, { runId: first }))).toBe('RESOLVED');
    // A pre-run plan (the standalone path) now finds a run: refused.
    expect(await refusalOf(() => resolveRoot(h.research, ref))).toBe(
      'ROOT_SUBJECT_ADMISSION_CAMPAIGN_RUN_NOT_FIRST',
    );
    expect(
      await sqlstate(() => startSubjectRun(h.research, { networkVantage: 'test', admissionId })),
    ).toBe('23514');
  });

  it('P1-1: in-flight wired research stops at its next request after EMERGENCY_STOP', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    const transport = new TrippingTransport(async () => {
      await recordControlEvent(h.admin, {
        campaignId: id,
        action: 'EMERGENCY_STOP',
        actorKey: 'owner-cli',
      });
    });
    for (const site of [SITES.university, SITES.association, SITES.buddy]) {
      transport.route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'));
    }
    transport.route(
      SITES.association,
      html(
        page('en', 'Tandem Exchange Association', 'Weekly language exchange.', [
          ['/events/', 'Events'],
          ['/about/', 'About'],
        ]),
      ),
    );
    transport.route(`${SITES.association}events/`, html(page('en', 'Events', 'Cafe.')));
    transport.route(`${SITES.association}about/`, html(page('en', 'About', 'Us.')));
    transport.route(SITES.university, html(page('en', 'International Office', 'Exchange.')));
    const result = await work(id, transport);
    expect(result.stopReason).toBe('CAMPAIGN_EMERGENCY_STOPPED');
    // Exactly the robots file and the page that tripped the stop: no further request.
    const pages = transport.requestedUrls.filter((u) => !u.endsWith('/robots.txt'));
    expect(pages).toHaveLength(1);
    const { rows } = await h.admin.query<{ outcome: string; reason: string | null }>(
      `SELECT o.outcome, o.refusal_reason AS reason
         FROM acquisition_work_outcomes o
         JOIN acquisition_work_items i ON i.id = o.work_item_id
        WHERE i.campaign_id = $1 AND i.stage = 'RESEARCH_PENDING'`,
      [id],
    );
    expect(rows).toEqual([{ outcome: 'REFUSED_TERMINAL', reason: 'CAMPAIGN_EMERGENCY_STOPPED' }]);
  });

  // ---------------------------------------------------------------- P1-2

  it('P1-2: spend is never below what the database observed, whatever the handler reports', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    const real = createStageHandlers(h.deps(fakeSdk(SEARCH_RESULTS), researchTransport()));
    // A handler that researches for real but REPORTS NOTHING (the self-report hole).
    const silent = real.map((x): StageHandler =>
      x.stage !== 'RESEARCH_PENDING'
        ? x
        : {
            stage: x.stage,
            handle: (item, ctx) => x.handle(item, { ...ctx, consume: () => undefined }),
          },
    );
    await work(id, researchTransport(), {}, silent);
    const reported = await count(
      `SELECT COALESCE(sum(o.gateway_requests_consumed), 0)::int AS n
         FROM acquisition_work_outcomes o JOIN acquisition_work_items i ON i.id = o.work_item_id
        WHERE i.campaign_id = $1`,
      [id],
    );
    const observed = await count(
      `SELECT count(*)::int AS n FROM orgunit_fetch_observations f
         JOIN subject_research_admissions a ON a.id = f.root_subject_admission_id
        WHERE a.campaign_id = $1`,
      [id],
    );
    expect(reported).toBe(0);
    expect(observed).toBeGreaterThan(0);
    const { rows } = await h.worker.query<{ g: number; r: number }>(
      'SELECT gateway_requests AS g, research_roots AS r FROM acquisition_campaign_spend($1)',
      [id],
    );
    expect(rows[0]!.g).toBe(observed);
    expect(rows[0]!.r).toBe(
      await count(
        `SELECT count(*)::int AS n FROM subject_research_admissions WHERE campaign_id = $1`,
        [id],
      ),
    );
  });

  // ---------------------------------------------------------------- P1-9

  it('P1-9: organisations found under an unverified smoke runtime wait for the OWNER, never advance', async () => {
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    const result = await work(id);
    expect(result.stopReason).not.toBe('CAMPAIGN_UNVERIFIED');
    expect(await states(id)).toEqual([
      expect.objectContaining({
        stage: 'DISCOVERED',
        state: 'AWAITING_HUMAN',
        reason: 'OWNER_SMOKE_VERIFICATION',
      }),
    ]);
    // The search ran (its nominations exist) but nothing reached NOMINATED.
    expect(
      await count(`SELECT count(*)::int AS n FROM source_discovery_nominations`),
    ).toBeGreaterThan(0);
    const { rows } = await h.admin.query<{ id: string }>(
      `SELECT r.id FROM source_discovery_runs r WHERE r.actor_key LIKE 'acq-%'`,
    );
    expect(await admissibleNominationsOfGrantedRun(h.readonly, rows[0]!.id)).toEqual({
      state: 'COMPLETED',
      nominations: [],
    });
  });

  it('P1-9: a granted run without a completion row is never advanced; an ungranted run is refused', async () => {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId] });
    const derived = await deriveCampaignAuthority(h.worker, id, { trust: h.campaignTrust });
    if (!derived.ok) throw new Error(derived.code);
    await seedCampaignSearchGrantRoots(h.worker, derived.authority);
    const root = (await states(id))[0]!;
    // A crashed search: the grant slot was taken under the item's actor key,
    // and the process died before any completion row.
    const { rows: brief } = await h.admin.query<{ id: string }>(
      `SELECT id FROM source_discovery_briefs ORDER BY created_at LIMIT 1`,
    );
    const crashed = await inSourceDiscoveryTransaction(h.source, (c) =>
      startGrantedRun(c, {
        grantId,
        briefId: brief[0]!.id,
        geography: 'JP',
        providerKey: 'claude-max-web-search',
        actorKey: `acq-${root.id}`,
      }),
    );
    expect(await admissibleNominationsOfGrantedRun(h.readonly, crashed.runId)).toEqual({
      state: 'RUN_NOT_COMPLETED',
      nominations: [],
    });
    const sdk = fakeSdk(SEARCH_RESULTS);
    await work(
      id,
      researchTransport(),
      { once: true },
      createStageHandlers(h.deps(sdk, researchTransport())),
    );
    // The earlier attempt's run is reused (no second search) and NOT advanced.
    expect(sdk.calls()).toBe(0);
    expect(await states(id)).toEqual([
      expect.objectContaining({
        stage: 'DISCOVERED',
        state: 'RETRY_SCHEDULED',
        reason: 'DEPENDENCY_NOT_READY',
      }),
    ]);
    expect(await admissibleNominationsOfGrantedRun(h.readonly, randomUUID())).toEqual({
      state: 'NOT_A_GRANTED_RUN',
      nominations: [],
    });
    // The OWNER's own verified smoke run is completed and admissible.
    const { rows: done } = await h.admin.query<{ id: string }>(
      `SELECT run_id AS id FROM source_discovery_run_completions LIMIT 1`,
    );
    expect((await admissibleNominationsOfGrantedRun(h.readonly, done[0]!.id)).state).toBe(
      'COMPLETED',
    );
  });

  // ---------------------------------------------------------------- P2-2

  it('P2-2: a campaign-subject binding must name the subject derived from (campaign, nomination)', async () => {
    const c = randomUUID();
    const n = randomUUID();
    const { rows } = await h.admin.query<{ id: string }>(
      'SELECT acquisition_campaign_subject_id($1, $2)::text AS id',
      [c, n],
    );
    expect(rows[0]!.id).toBe(campaignSubjectIdOf(c, n));

    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    let dedup = (await states(id)).find((s) => s.stage === 'DEDUPLICATED' && s.state === 'PENDING');
    while (dedup === undefined) {
      await work(id, researchTransport(), { once: true });
      dedup = (await states(id)).find((s) => s.stage === 'DEDUPLICATED' && s.state === 'PENDING');
    }
    await claimSpecificWorkItem(h.worker, {
      campaignId: id,
      workItemId: dedup.id,
      attemptNo: 1,
      workerId: 'test-hacq-hand',
      leaseSeconds: 300,
    });
    const { rows: nom } = await h.admin.query<{ url: string }>(
      'SELECT url FROM source_discovery_nominations WHERE id = $1',
      [dedup.subject],
    );
    const bind = (subjectId: string) =>
      sqlstate(() =>
        h.worker.query(
          `INSERT INTO acquisition_campaign_subjects
             (campaign_id, work_item_id, nomination_id, subject_id, registrable_domain,
              nominated_url, actor_key)
           VALUES ($1, $2, $3, $4, $5, $6, 'acquisition-worker')`,
          [id, dedup!.id, dedup!.subject, subjectId, dedup!.domain, nom[0]!.url],
        ),
      );
    // A forged subject (e.g. an existing, unrelated discovery subject) is refused.
    expect(await bind(randomUUID())).toBe('23514');
    expect(await bind(campaignSubjectIdOf(id, dedup.subject))).toBe('SUCCEEDED');
  });

  // ---------------------------------------------------------------- P2-3

  it('P2-3: acquisition writes under REPEATABLE READ or SERIALIZABLE are refused', async () => {
    const id = await campaign({ grantIds: [await h.grant('JP')] }, false);
    for (const level of ['REPEATABLE READ', 'SERIALIZABLE']) {
      const client = await h.admin.connect();
      try {
        await client.query(`BEGIN ISOLATION LEVEL ${level}`);
        expect(
          await sqlstate(() =>
            client.query(
              `INSERT INTO acquisition_campaign_control_events
                 (campaign_id, sequence_no, action, actor_key)
               VALUES ($1, 1, 'START', 'owner-cli')`,
              [id],
            ),
          ),
        ).toBe('25001');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    }
    // READ COMMITTED (the default) records it.
    await recordControlEvent(
      h.admin,
      { campaignId: id, action: 'START', actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    // Every window and lease rule reads the statement clock.
    for (const fn of [
      'acquisition_claim_verify_insert',
      'subject_research_admission_campaign_verify',
      'acquisition_work_item_verify_insert',
      'acquisition_item_in_flight',
    ]) {
      const { rows } = await h.admin.query<{ def: string }>(
        `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p WHERE p.proname = $1`,
        [fn],
      );
      expect(rows[0]!.def, fn).toContain('clock_timestamp()');
    }
  });

  // ---------------------------------------------------------------- P2-4

  it('P2-4: review sign needs --expect per subject and refuses a stale digest before reading a key', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    expect((await work(id)).stopReason).toBe('QUEUE_DRAINED');
    const listed: string[] = [];
    await runAcquisitionCli(['review', 'list', '--campaign-id', id, '--json'], {
      readonlyPool: h.poolFactory('readonly'),
      reviewTrust: h.reviewTrust,
      out: (t) => void listed.push(t),
    });
    const subjects = (
      JSON.parse(listed.join('')) as {
        subjects: { subjectId: string; stateDigest: string; reviewHead: string | null }[];
      }
    ).subjects;
    expect(subjects.length).toBeGreaterThan(0);
    for (const s of subjects) {
      expect(s.stateDigest).toMatch(/^[0-9a-f]{64}$/);
      expect(s.reviewHead).toBeNull();
    }
    const target = subjects[0]!;
    let prompts = 0;
    const sign = async (extra: string[]) => {
      const out: string[] = [];
      const code = await runAcquisitionCli(
        [
          'review',
          'sign',
          '--campaign-id',
          id,
          '--subject-id',
          target.subjectId,
          ...extra,
          '--key-file',
          h.reviewKeyFile,
          '--key-id',
          h.reviewKey.keyId,
          '--execute',
          '--json',
        ],
        {
          readonlyPool: h.poolFactory('readonly'),
          reviewerPool: h.poolFactory('reviewer'),
          ownerPool: h.poolFactory('admin'),
          reviewTrust: h.reviewTrust,
          passphrase: () => {
            prompts += 1;
            return Promise.resolve(Buffer.from(h.reviewPassphrase, 'utf8'));
          },
          out: (t) => void out.push(t),
          err: () => undefined,
        },
      );
      return { code, json: JSON.parse(out.join('')) as { code?: string; outcome: string } };
    };
    expect(await sign([])).toMatchObject({ code: 1, json: { code: 'EXPECTATION_MISSING' } });
    expect(await sign(['--expect', `${target.subjectId}=${'0'.repeat(64)}`])).toMatchObject({
      code: 1,
      json: { code: 'STATE_DIGEST_MISMATCH' },
    });
    expect(
      await sign([
        '--expect',
        `${target.subjectId}=${target.stateDigest}`,
        '--expect',
        `${randomUUID()}=${target.stateDigest}`,
      ]),
    ).toMatchObject({ code: 1, json: { code: 'EXPECTATION_UNLISTED' } });
    expect(prompts).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM subject_review_attestations`)).toBe(0);
    // The digest the list showed: signed and released.
    expect(await sign(['--expect', `${target.subjectId}=${target.stateDigest}`])).toMatchObject({
      code: 0,
      json: { outcome: 'REVIEWED' },
    });
    expect(prompts).toBe(1);
    const { rows } = await h.admin.query<{ ok: boolean }>(
      'SELECT acquisition_subject_identity_confirmed($1) AS ok',
      [target.subjectId],
    );
    expect(rows[0]!.ok).toBe(true);
  });

  // ---------------------------------------------------------------- P2-5

  /** The association links out to the buddy group, and the buddy group to a second hop. */
  function twoHopTransport(): ScriptedTransport {
    const t = researchTransport();
    t.route(`${SECOND_HOP}robots.txt`, response(200, ALLOW_ALL, 'text/plain'));
    t.route(
      SITES.buddy,
      html(
        page('en', 'Buddy Group Tokyo', 'Buddies for exchange students.', [
          [SECOND_HOP, 'Second Hop Circle'],
        ]),
      ),
    );
    t.route(SECOND_HOP, html(page('en', 'Second Hop Circle', 'Conversation circle.')));
    return t;
  }

  const linkOutRoots = async (id: string) =>
    (await states(id)).filter((s) => s.stage === 'DISCOVERED' && s.source === 'LINK_OUT').length;

  it('P2-5: a v1 campaign follows ONE link-out generation; the database refuses the second', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    expect((await work(id, twoHopTransport())).stopReason).toBe('QUEUE_DRAINED');
    expect(await linkOutRoots(id)).toBe(1);
    // The buddy group's own run (a hop-1 subject) captured the second hop ...
    const { rows } = await h.admin.query<{ run: string }>(
      `SELECT r.id AS run FROM orgunit_research_runs r
         JOIN subject_research_admissions a ON r.root_scope = 'subject_admission:' || a.id::text
        WHERE a.website_url = $1`,
      [SITES.buddy],
    );
    const { rows: hop } = await h.worker.query<{ hop: number }>(
      'SELECT acquisition_link_out_hop_of_run($1) AS hop',
      [rows[0]!.run],
    );
    expect(hop[0]!.hop).toBe(2);
    // ... and the worker capability cannot enqueue it, even by hand.
    await expect(
      enqueueCampaignLinkOutRoot(
        h.worker,
        { campaignId: id, scope: { sourceKinds: ['LINK_OUT'] } },
        rows[0]!.run,
      ),
    ).rejects.toThrow(/LINK_OUT_HOP_LIMIT/);
  });

  it('P2-5: a v2 campaign signs its depth: 0 follows no link-out, 2 follows the second generation', async () => {
    await h.verifySmokeRuntime();
    const grant = await h.grant('JP');
    const none = await campaign({ grantIds: [grant], linkOutMaxHops: '0' });
    expect((await work(none, twoHopTransport())).stopReason).toBe('QUEUE_DRAINED');
    expect(await linkOutRoots(none)).toBe(0);
    const { rows } = await h.admin.query<{ v: string; hops: number }>(
      'SELECT document_version AS v, link_out_max_hops AS hops FROM acquisition_campaigns WHERE id = $1',
      [none],
    );
    expect(rows[0]).toEqual({ v: 'nwf-pe.acquisition-campaign.v2', hops: 0 });

    await truncateWiring(h.admin);
    await h.verifySmokeRuntime();
    const two = await campaign({ grantIds: [await h.grant('JP')], linkOutMaxHops: '2' });
    expect((await work(two, twoHopTransport())).stopReason).toBe('QUEUE_DRAINED');
    expect(await linkOutRoots(two)).toBe(2);
  });

  // ---------------------------------------------------------------- P2-14

  it('P2-14: the outbox root is narrowed back to 0700 and no temporary file survives', async () => {
    await h.verifySmokeRuntime();
    const id = await campaign({ grantIds: [await h.grant('JP')] });
    chmodSync(h.outboxDir, 0o755);
    expect((await work(id)).stopReason).toBe('QUEUE_DRAINED');
    expect(statSync(h.outboxDir).mode & 0o777).toBe(0o700);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(join(h.outboxDir, id));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => f.includes('.tmp-'))).toEqual([]);
    for (const f of files) expect(statSync(f).mode & 0o777).toBe(0o600);
  });

  it('a worker pool is a real pool (sanity for the hand-claim helpers)', () => {
    expect(h.worker).toBeInstanceOf(pg.Pool);
  });
});

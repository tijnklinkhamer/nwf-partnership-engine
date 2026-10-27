/**
 * WW E-W - the WIRED acquisition pipeline end to end, against a DISPOSABLE
 * PostgreSQL (migrations 0023 + 0024, ADR 0030).
 *
 * A TEST-ONLY signed campaign with ONE search grant; a FAKE Agent SDK that
 * returns three results (an ECHE-duplicate domain, a large university and a
 * small exchange association absent from every seed and register); a
 * SCRIPTED research transport whose association page links out to a buddy
 * group. The worker runs the six wired stages without a prompt per
 * organisation; identity review stays a batched, OWNER-signed act.
 *
 * Nothing here reaches a network, a model or a real organisation.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runAcquisitionCli } from '../../cli/commands/acquisition.js';
import { claimSpecificWorkItem } from '../../orgunits/acquisition/store.js';
import {
  CampaignTrustSet,
  recordCampaign,
  recordControlEvent,
  runWorker,
  WORKER_STAGES,
  type StageHandlerContext,
  type WorkItemView,
} from '../../orgunits/acquisition/index.js';
import { createHostCircuitBreaker } from '../../orgunits/orchestrator/circuitBreaker.js';
import {
  OUTBOX_EXPORT_V2_FILE,
  OUTBOX_MANIFEST_FILE,
  OUTBOX_SUBJECT_FACTS_FILE,
  campaignSubjectIdOf,
  createStageHandlers,
  loadAcquisitionStatusV1,
  type OutboxManifestLine,
} from '../../orgunits/acquisitionWiring/index.js';
import {
  signedCampaign,
  testCampaignKey,
  campaignTrustEntry,
} from '../helpers/acquisitionCampaignFixtures.js';
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
const ALL_STAGES = [...WORKER_STAGES];

describeDb('WW E-W wired acquisition pipeline (integration)', () => {
  let h: WiringHarness;

  beforeAll(async () => {
    h = await createWiringHarness('acqew');
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
      geographies?: string[];
      stages?: string[];
      sourceKinds?: string[];
      budgets?: Record<string, string>;
    },
    start = true,
  ): Promise<string> {
    const text = signedCampaign(h.campaignKey, {
      environmentId: h.environmentId,
      geographies: draft.geographies ?? ['JP'],
      sourceKinds: draft.sourceKinds ?? ['SEARCH_GRANT', 'LINK_OUT'],
      stages: draft.stages ?? ALL_STAGES,
      searchGrantIds: draft.grantIds,
      budgets: { maxConcurrency: '1', ...draft.budgets },
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
    sdk = fakeSdk(SEARCH_RESULTS),
    transport = researchTransport(),
    extra: Partial<Parameters<typeof runWorker>[0]> = {},
  ) =>
    runWorker({
      pool: h.worker,
      campaignId,
      workerId: 'test-wiring-worker',
      handlers: createStageHandlers(h.deps(sdk, transport)),
      trust: h.campaignTrust,
      ...FAST,
      ...extra,
    });

  async function states(campaignId: string) {
    const { rows } = await h.admin.query<{
      stage: string;
      state: string;
      domain: string | null;
      subject: string;
      source: string;
      reason: string | null;
    }>(
      `SELECT stage, state, registrable_domain AS domain, subject_id AS subject,
              source_kind AS source, COALESCE(refusal_reason, human_queue, retry_reason, failure_reason) AS reason
         FROM acquisition_work_item_states WHERE campaign_id = $1
        ORDER BY created_at, stage, registrable_domain`,
      [campaignId],
    );
    return rows;
  }

  async function researchOrder(): Promise<string[]> {
    const { rows } = await h.admin.query<{ url: string }>(
      `SELECT a.website_url AS url FROM orgunit_research_runs r
         JOIN subject_research_admissions a ON r.root_scope = 'subject_admission:' || a.id::text
        ORDER BY r.started_at, r.id`,
    );
    return rows.map((r) => r.url);
  }

  const count = async (sql: string, params: unknown[] = []): Promise<number> =>
    (await h.admin.query<{ n: number }>(sql, params)).rows[0]!.n;

  // -------------------------------------------------------------------------

  it('runs search -> dedupe -> propose -> campaign admission -> research -> outbox -> OWNER review', async () => {
    await h.echeClaim('eche-dup-fict.jp');
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId] });
    const sdk = fakeSdk(SEARCH_RESULTS);
    const transport = researchTransport();

    const first = await work(id, sdk, transport);
    if (first.stopReason !== 'QUEUE_DRAINED') console.log(JSON.stringify(await states(id)));
    expect(first.stopReason).toBe('QUEUE_DRAINED');
    expect(sdk.calls()).toBe(1);
    // WW E-SDFX (ADR 0028 s9): the one search went through the adapter's gate -
    // the PreToolUse hook and canUseTool both consulted, nothing pre-approved -
    // and it was the grant's D8 smoke call, so no OWNER verification is needed.
    expect(sdk.decisions).toEqual([
      'hook:WebSearch:pass',
      'canUseTool:WebSearch:allow',
      'hook:StructuredOutput:pass',
    ]);
    expect(
      (
        await h.admin.query(
          `SELECT q.outcome, q.smoke FROM source_discovery_query_calls q
             JOIN source_discovery_runs r ON r.id = q.run_id WHERE r.actor_key LIKE 'acq-%'`,
        )
      ).rows,
    ).toEqual([{ outcome: 'RESULTS', smoke: true }]);

    // ONE granted search run, keyed to the root item.
    expect(
      await count(
        `SELECT count(*)::int AS n FROM source_discovery_runs WHERE actor_key LIKE 'acq-%'`,
      ),
    ).toBe(1);

    // The ECHE duplicate is REFUSED with a named signal; nothing merged, never fetched.
    const all = await states(id);
    expect(
      all.find((s) => s.stage === 'NOMINATED' && s.domain === 'eche-dup-fict.jp'),
    ).toMatchObject({ state: 'REFUSED_TERMINAL', reason: 'DUPLICATE' });
    const { rows: signals } = await h.admin.query<{
      kind: string;
      domain: string;
      rel: string | null;
    }>(
      `SELECT signal_kind AS kind, registrable_domain AS domain, related_kind AS rel
         FROM acquisition_signals ORDER BY 1`,
    );
    expect(signals).toEqual([
      { kind: 'DUPLICATE_OF_WEBSITE_CLAIM', domain: 'eche-dup-fict.jp', rel: 'WEBSITE_CLAIM' },
      { kind: 'LARGE_HEI_TAGGED', domain: 'fict-u.ac.jp', rel: null },
    ]);
    expect(transport.resolvedHosts).not.toContain('www.eche-dup-fict.jp');

    // The association and the buddy group (a link-out root) are researched
    // BEFORE the deprioritised university, which is still researched.
    expect(await researchOrder()).toEqual([SITES.association, SITES.buddy, SITES.university]);
    const linkOutRoots = all.filter((s) => s.stage === 'DISCOVERED' && s.source === 'LINK_OUT');
    expect(linkOutRoots).toHaveLength(1);
    // Every research root is a CAMPAIGN admission bound to this campaign.
    expect(
      await count(
        `SELECT count(*)::int AS n FROM subject_research_admissions
          WHERE admission_basis = 'CAMPAIGN' AND campaign_id = $1
            AND policy_version = 'subject-research-admission-policy-campaign-v1'`,
        [id],
      ),
    ).toBe(3);

    // Three subjects await the OWNER; the export pair of each is in the outbox, 0600.
    const awaiting = (await states(id)).filter((s) => s.stage === 'IDENTITY_REVIEW');
    expect(awaiting.map((s) => [s.state, s.reason])).toEqual([
      ['AWAITING_HUMAN', 'OWNER_IDENTITY_REVIEW'],
      ['AWAITING_HUMAN', 'OWNER_IDENTITY_REVIEW'],
      ['AWAITING_HUMAN', 'OWNER_IDENTITY_REVIEW'],
    ]);
    for (const s of awaiting) {
      for (const file of [OUTBOX_EXPORT_V2_FILE, OUTBOX_SUBJECT_FACTS_FILE]) {
        const path = join(h.outboxDir, id, 'subjects', s.subject, file);
        expect(existsSync(path), path).toBe(true);
        expect(statSync(path).mode & 0o777).toBe(0o600);
      }
      const doc = JSON.parse(
        readFileSync(join(h.outboxDir, id, 'subjects', s.subject, OUTBOX_EXPORT_V2_FILE), 'utf8'),
      ) as { document: string; subjectId: string };
      expect(doc).toMatchObject({
        document: 'nwf-pe.qualification-input-export.v2',
        subjectId: s.subject,
      });
    }
    expect(existsSync(join(h.outboxDir, id, OUTBOX_MANIFEST_FILE))).toBe(false);

    // The batched OWNER review: list, then sign TWO listed subjects.
    const listed: string[] = [];
    expect(
      await runAcquisitionCli(['review', 'list', '--campaign-id', id, '--json'], {
        readonlyPool: h.poolFactory('readonly'),
        out: (t) => void listed.push(t),
      }),
    ).toBe(0);
    const list = JSON.parse(listed.join('')) as {
      subjects: {
        subjectId: string;
        rootUrl: string;
        names: string[];
        registeredKind: string;
        stateDigest: string;
      }[];
    };
    expect(list.subjects.map((s) => s.rootUrl).sort()).toEqual(
      [SITES.association, SITES.buddy, SITES.university].sort(),
    );
    expect(list.subjects.every((s) => s.registeredKind === 'UNCERTAIN')).toBe(true);
    const assoc = list.subjects.find((s) => s.rootUrl === SITES.association)!.subjectId;
    const buddy = list.subjects.find((s) => s.rootUrl === SITES.buddy)!.subjectId;
    const digestOf = (id: string) => list.subjects.find((s) => s.subjectId === id)!.stateDigest;

    const signedOut: string[] = [];
    let prompts = 0;
    const exit = await runAcquisitionCli(
      [
        'review',
        'sign',
        '--campaign-id',
        id,
        '--subject-id',
        assoc,
        '--subject-id',
        buddy,
        '--expect',
        `${assoc}=${digestOf(assoc)}`,
        '--expect',
        `${buddy}=${digestOf(buddy)}`,
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
        out: (t) => void signedOut.push(t),
        err: () => undefined,
      },
    );
    expect(exit, signedOut.join('')).toBe(0);
    expect(prompts).toBe(1);
    expect(await count(`SELECT count(*)::int AS n FROM subject_review_attestations`)).toBe(2);

    const second = await work(id, sdk, transport);
    expect(second.stopReason).toBe('QUEUE_DRAINED');
    expect(sdk.calls()).toBe(1);
    const lines = readFileSync(join(h.outboxDir, id, OUTBOX_MANIFEST_FILE), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as OutboxManifestLine);
    expect(lines.map((l) => l.subjectId).sort()).toEqual([assoc, buddy].sort());
    for (const line of lines) {
      expect(line.format).toBe('nwf-pe.acquisition-outbox.v1');
      expect(line.campaignId).toBe(id);
      const bytes = readFileSync(join(h.outboxDir, id, line.files.qualificationInputExportV2.path));
      const { createHash } = await import('node:crypto');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        line.files.qualificationInputExportV2.sha256,
      );
    }

    const status = await loadAcquisitionStatusV1(h.readonly, id, h.campaignTrust);
    expect(status).toMatchObject({
      schema: 'nwf-pe.acquisition-status.v1',
      campaign: { controlState: 'RUNNING', verified: true },
      discovery: { searchRuns: 1, linkOutRoots: 1 },
      candidates: {
        discovered: 4,
        deduplicated: 3,
        proposed: 3,
        researched: 3,
        duplicatesRefused: 1,
        largeHeiDeprioritised: 1,
      },
      identityReview: { awaiting: 1, released: 2 },
      outbox: { researchExports: 3, manifestEntries: 2 },
    });
    expect(status!.lastSuccessfulResearchAt).not.toBeNull();
    expect(status!.discovery.latestRun).not.toBeNull();
    expect(status!.failures).toEqual([
      expect.objectContaining({ stage: 'NOMINATED', reason: 'DUPLICATE', count: 1 }),
    ]);
    expect(status!.budgets.maxResearchRoots).toEqual({ limit: 10, used: 3, remaining: 7 });
  });

  it('a restart in the middle does no duplicate work, and a crashed research attempt is reused', async () => {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId] });
    const sdk = fakeSdk(SEARCH_RESULTS);
    const transport = researchTransport();
    // Stop after a few items, as a supervisor would on SIGTERM.
    const stopped = await work(id, sdk, transport, { maxItems: 5 });
    expect(stopped.stopReason).toBe('MAX_ITEMS_REACHED');

    // Crash an attempt: claim the next RESEARCH_PENDING item by hand, run its
    // handler (which researches), and never record an outcome.
    let pending = (await states(id)).find(
      (s) => s.stage === 'RESEARCH_PENDING' && s.state === 'PENDING',
    );
    while (pending === undefined) {
      await work(id, sdk, transport, { once: true });
      pending = (await states(id)).find(
        (s) => s.stage === 'RESEARCH_PENDING' && s.state === 'PENDING',
      );
    }
    const { rows: itemRows } = await h.admin.query<{ id: string }>(
      `SELECT id FROM acquisition_work_items WHERE campaign_id = $1 AND stage = 'RESEARCH_PENDING'
          AND subject_id = $2`,
      [id, pending.subject],
    );
    const itemId = itemRows[0]!.id;
    await claimSpecificWorkItem(h.worker, {
      campaignId: id,
      workItemId: itemId,
      attemptNo: 1,
      workerId: 'test-crashed-worker',
      leaseSeconds: 1,
    });
    const item: WorkItemView = {
      id: itemId,
      campaignId: id,
      stage: 'RESEARCH_PENDING',
      sourceKind: 'SEARCH_GRANT',
      subjectKind: 'DISCOVERY_SUBJECT',
      subjectId: pending.subject,
      registrableDomain: pending.domain,
      parentItemId: null,
      priority: 300,
      idempotencyKey: `RESEARCH_PENDING|DISCOVERY_SUBJECT:${pending.subject}`,
    };
    const ctx: StageHandlerContext = {
      campaign: {
        campaignId: id,
        campaignKey: 'x',
        scope: {
          geographies: ['JP'],
          searchGrantIds: [grantId],
          sourceKinds: ['SEARCH_GRANT', 'LINK_OUT'],
          stages: ALL_STAGES,
          linkOutMaxHops: 1,
        },
        budgets: {} as never,
      },
      attemptNo: 1,
      remaining: { searchRuns: 0, researchRoots: 1, gatewayRequests: 60 },
      consume: () => undefined,
      signal: new AbortController().signal,
      clock: { now: () => Date.now(), sleep: () => Promise.resolve() },
      circuit: createHostCircuitBreaker(),
    };
    const handler = createStageHandlers(h.deps(sdk, transport)).find(
      (x) => x.stage === 'RESEARCH_PENDING',
    )!;
    // The lease is 1 s: the handler finishes after it lapsed, as a dead process would.
    await handler.handle(item, ctx);
    await new Promise((r) => setTimeout(r, 1200));
    const runsBefore = await count(`SELECT count(*)::int AS n FROM orgunit_research_runs`);

    const done = await work(id, sdk, transport);
    expect(done.stopReason).toBe('QUEUE_DRAINED');
    expect(sdk.calls()).toBe(1);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM source_discovery_grant_uses WHERE grant_id = $1`,
        [grantId],
      ),
    ).toBe(1);
    // Four subjects (no ECHE claim here), four research runs: the crashed
    // attempt's run was reused, not repeated.
    expect(await count(`SELECT count(*)::int AS n FROM orgunit_research_runs`)).toBe(4);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM subject_research_admissions WHERE subject_id = $1`,
        [pending.subject],
      ),
    ).toBe(1);
    expect(runsBefore).toBeLessThanOrEqual(4);
    const { rows: attempts } = await h.admin.query<{ n: number; spent: number }>(
      `SELECT max(c.attempt_no)::int AS n, COALESCE(sum(o.gateway_requests_consumed), 0)::int AS spent
         FROM acquisition_work_claims c LEFT JOIN acquisition_work_outcomes o ON o.claim_id = c.id
        WHERE c.work_item_id = $1`,
      [itemId],
    );
    expect(attempts[0]!.n).toBe(2);
    expect(attempts[0]!.spent).toBeGreaterThan(0);
    expect((await states(id)).filter((s) => s.stage === 'IDENTITY_REVIEW')).toHaveLength(4);
  });

  it('honours PAUSE and STOP: nothing is claimed and nothing is searched', async () => {
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId] });
    await recordControlEvent(h.admin, { campaignId: id, action: 'PAUSE', actorKey: 'owner-cli' });
    const sdk = fakeSdk(SEARCH_RESULTS);
    expect((await work(id, sdk)).stopReason).toBe('CAMPAIGN_PAUSED');
    await recordControlEvent(h.admin, { campaignId: id, action: 'STOP', actorKey: 'owner-cli' });
    expect((await work(id, sdk)).stopReason).toBe('CAMPAIGN_STOPPED');
    expect(sdk.calls()).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM acquisition_work_claims`)).toBe(0);
  });

  it('a campaign that does not list RESEARCH_PENDING never fetches', async () => {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await campaign({
      grantIds: [grantId],
      stages: ['DISCOVERED', 'NOMINATED', 'DEDUPLICATED'],
    });
    const transport = researchTransport();
    const result = await work(id, fakeSdk(SEARCH_RESULTS), transport);
    expect(result.stopReason).toBe('QUEUE_DRAINED');
    expect(transport.requestedUrls).toEqual([]);
    expect(transport.resolvedHosts).toEqual([]);
    expect(await count(`SELECT count(*)::int AS n FROM subject_research_admissions`)).toBe(0);
    // Proposals parked at RESEARCH_PENDING, unclaimed.
    expect(
      (await states(id)).filter((s) => s.stage === 'RESEARCH_PENDING').map((s) => s.state),
    ).toEqual(['PENDING', 'PENDING', 'PENDING']);
  });

  it('a search grant outside the campaign geographies is refused before any search', async () => {
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId], geographies: ['NL'] });
    const sdk = fakeSdk(SEARCH_RESULTS);
    const result = await work(id, sdk);
    expect(result.stopReason).toBe('QUEUE_DRAINED');
    expect(sdk.calls()).toBe(0);
    expect(await states(id)).toEqual([
      expect.objectContaining({
        stage: 'DISCOVERED',
        state: 'REFUSED_TERMINAL',
        reason: 'OUT_OF_SCOPE',
      }),
    ]);
  });

  it('enforces the research-root budget: one root, then BUDGET_EXHAUSTED with the rest waiting', async () => {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId], budgets: { maxResearchRoots: '1' } });
    const result = await work(id);
    expect(result.stopReason).toBe('BUDGET_EXHAUSTED');
    expect(result.detail).toBe('maxResearchRoots');
    expect(await count(`SELECT count(*)::int AS n FROM orgunit_research_runs`)).toBe(1);
    const status = await loadAcquisitionStatusV1(h.readonly, id, h.campaignTrust);
    expect(status!.budgets.maxResearchRoots).toEqual({ limit: 1, used: 1, remaining: 0 });
  });

  it('a gateway budget below one root reservation never researches', async () => {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId], budgets: { maxGatewayRequests: '59' } });
    const transport = researchTransport();
    const result = await work(id, fakeSdk(SEARCH_RESULTS), transport);
    expect(result.stopReason).toBe('BUDGET_EXHAUSTED');
    expect(result.detail).toBe('maxGatewayRequests');
    expect(transport.requestedUrls).toEqual([]);
  });

  it('an unsigned-for-this-build or foreign campaign does nothing', async () => {
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId] });
    const sdk = fakeSdk(SEARCH_RESULTS);
    // The operational (EMPTY) trust set: the production default.
    const operational = await runWorker({
      pool: h.worker,
      campaignId: id,
      workerId: 'test-wiring-worker',
      handlers: createStageHandlers(h.deps(sdk, researchTransport())),
      ...FAST,
    });
    expect(operational.stopReason).toBe('CAMPAIGN_UNVERIFIED');
    // A foreign key's trust set.
    const foreign = CampaignTrustSet.vitestOnly([
      campaignTrustEntry(testCampaignKey('test-foreign-k')),
    ]);
    expect((await work(id, sdk, researchTransport(), { trust: foreign })).stopReason).toBe(
      'CAMPAIGN_UNVERIFIED',
    );
    expect(sdk.calls()).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM acquisition_work_claims`)).toBe(0);
  });

  it('the production handlers cannot run without a verifying campaign (trust set empty)', async () => {
    const grantId = await h.grant('JP');
    const id = await campaign({ grantIds: [grantId] });
    const out: string[] = [];
    const exit = await runAcquisitionCli(
      ['worker', '--campaign-id', id, '--outbox-dir', h.outboxDir, '--json'],
      {
        readonlyPool: h.poolFactory('readonly'),
        workerPool: h.poolFactory('worker'),
        out: (t) => void out.push(t),
      },
    );
    expect(exit).toBe(0);
    expect(JSON.parse(out.join(''))).toMatchObject({
      outcome: 'STOPPED',
      summary: { stopReason: 'CAMPAIGN_UNVERIFIED', processed: 0 },
    });
    expect(await count(`SELECT count(*)::int AS n FROM acquisition_work_claims`)).toBe(0);
    expect(await count(`SELECT count(*)::int AS n FROM source_discovery_runs`)).toBe(0);
  });

  it('derives the campaign subject id deterministically (a retried proposal is the same subject)', () => {
    const c = randomUUID();
    const n = randomUUID();
    expect(campaignSubjectIdOf(c, n)).toBe(campaignSubjectIdOf(c, n));
    expect(campaignSubjectIdOf(c, n)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(campaignSubjectIdOf(c, n)).not.toBe(campaignSubjectIdOf(randomUUID(), n));
  });
});

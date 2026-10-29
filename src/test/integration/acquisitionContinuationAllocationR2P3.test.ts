/**
 * R2-P3 - a v3 continuation campaign adopts a listed nomination ONLY when its
 * signed budgets can carry the whole lineage to the OWNER's identity review,
 * against a DISPOSABLE PostgreSQL.
 *
 * The OWNER's R2-P3 shape (16 listed, 8 research roots, 600 gateway
 * requests, 400 work items) scaled down: more listed nominations than signed
 * research roots. Before this correction every listed nomination was adopted
 * at the worker start; the lineages beyond the research-root budget parked at
 * RESEARCH_PENDING, the worker stopped BUDGET_EXHAUSTED, and - because a
 * nomination is adopted at most once, globally - they could never be
 * continued by any campaign. Now: exactly the lineages the budgets carry are
 * adopted, in signed order; the rest are skipped NO_PROCESSING_ALLOCATION,
 * stay untouched in the STOPPED predecessor, and a later campaign adopts them.
 *
 * Nothing here reaches a network, a model or a real organisation: the search
 * is a fake SDK and the research web a scripted transport.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { adoptContinuation, loadCampaignUsage } from '../../orgunits/acquisition/store.js';
import {
  deriveCampaignAuthority,
  recordCampaign,
  recordControlEvent,
  runWorker,
  WORKER_STAGES,
} from '../../orgunits/acquisition/index.js';
import {
  continuationScopeCheck,
  createStageHandlers,
  loadAcquisitionStatusV1,
} from '../../orgunits/acquisitionWiring/index.js';
import { signedCampaign } from '../helpers/acquisitionCampaignFixtures.js';
import {
  createWiringHarness,
  fakeSdk,
  researchTransport,
  truncateWiring,
  type FakeResult,
  type WiringHarness,
} from '../helpers/acquisitionWiringHarness.js';
import { ALLOW_ALL, html, page, response } from '../helpers/relSubjectHarness.js';
import { researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;
const FAST = { idleSleepMs: 10, idleTimeoutMs: 300, controlPollMs: 20, leaseSeconds: 120 } as const;

/** Sixteen fictitious language-exchange organisations, found by one granted JP search. */
const NAMES = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliett',
  'kilo',
  'lima',
  'mike',
  'november',
  'oscar',
  'papa',
] as const;
const RESULTS: readonly FakeResult[] = NAMES.map((n) => [
  `https://www.alloc-${n}-fict.jp/`,
  `${n[0]!.toUpperCase()}${n.slice(1)} Tandem Circle`,
]);
const DOMAINS = NAMES.map((n) => `alloc-${n}-fict.jp`);
/** The OWNER's priority: not the lexical order. */
const ORDER = [...DOMAINS].reverse();
/** An off-domain organisation one research page links to (a link-out). */
const LINKED = 'https://www.alloc-linked-fict.jp/';

/** The scripted research web: robots allow-all and one page per site; the first links out. */
function transport() {
  const t = researchTransport();
  for (const [url, title] of RESULTS) {
    t.route(`${url}robots.txt`, response(200, ALLOW_ALL, 'text/plain'));
    const links: [string, string][] = url === RESULTS[0]![0] ? [[LINKED, 'Linked Circle']] : [];
    t.route(url, html(page('en', title, 'Weekly language exchange evenings.', links)));
  }
  t.route(`${LINKED}robots.txt`, response(200, ALLOW_ALL, 'text/plain'));
  t.route(LINKED, html(page('en', 'Linked Circle', 'Conversation tables on Fridays.')));
  return t;
}

describeDb('R2-P3 allocation-gated continuation (integration)', () => {
  let h: WiringHarness;

  beforeAll(async () => {
    h = await createWiringHarness('acqr2p3');
  });
  afterAll(async () => {
    await truncateWiring(h.admin);
    await h.tearDown();
  });
  beforeEach(async () => {
    await truncateWiring(h.admin);
  });

  async function record(draft: Parameters<typeof signedCampaign>[1]) {
    const r = await recordCampaign(
      h.admin,
      Buffer.from(signedCampaign(h.campaignKey, draft)),
      { actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    await control(r.campaignId, 'START');
    return r.campaignId;
  }

  const control = (campaignId: string, action: 'START' | 'STOP') =>
    recordControlEvent(
      h.admin,
      { campaignId, action, actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );

  const work = (campaignId: string) =>
    runWorker({
      pool: h.worker,
      campaignId,
      workerId: 'test-allocation-worker',
      handlers: createStageHandlers(h.deps(fakeSdk(RESULTS), transport())),
      continuationScope: continuationScopeCheck(() => h.readonly),
      trust: h.campaignTrust,
      ...FAST,
    });

  /** A predecessor whose signed work-item budget strands all sixteen nominations, then STOPPED. */
  async function predecessor() {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await record({
      environmentId: h.environmentId,
      geographies: ['JP'],
      sourceKinds: ['SEARCH_GRANT'],
      stages: [...WORKER_STAGES],
      searchGrantIds: [grantId],
      budgets: { maxConcurrency: '1', maxWorkItems: '17' },
    });
    expect((await work(id)).stopReason).toBe('QUEUE_DRAINED');
    const { rows } = await h.admin.query<{ domain: string; nomination: string }>(
      `SELECT s.registrable_domain AS domain, s.subject_id AS nomination
         FROM acquisition_work_item_states s
        WHERE s.campaign_id = $1 AND s.stage = 'NOMINATED' AND s.state = 'ADVANCED'
          AND NOT EXISTS (SELECT 1 FROM acquisition_work_items c
                           WHERE c.parent_item_id = s.work_item_id)`,
      [id],
    );
    expect(rows.map((r) => r.domain).sort()).toEqual([...DOMAINS].sort());
    await control(id, 'STOP');
    const nom = Object.fromEntries(rows.map((r) => [r.domain, r.nomination]));
    return { id, grantId, nom };
  }

  /** A v3 continuation signing every worker stage (the template's), reuse only. */
  function continuation(
    pred: { id: string; grantId: string },
    nominationIds: string[],
    budgets: Record<string, string>,
    sourceKinds: string[] = ['SEARCH_GRANT'],
  ) {
    return record({
      environmentId: h.environmentId,
      geographies: ['JP'],
      sourceKinds,
      stages: [...WORKER_STAGES],
      searchGrantIds: [pred.grantId],
      budgets: {
        maxConcurrency: '1',
        maxSearchRuns: '0',
        maxItemsPerRegistrableDomain: '12',
        ...budgets,
      },
      continuation: { predecessorCampaignId: pred.id, nominationIds },
    });
  }

  /** Every adopted lineage of `campaignId`: its nomination and the stage and state of its head. */
  async function lineages(campaignId: string) {
    const { rows } = await h.admin.query<{
      nomination: string;
      position: number;
      stage: string;
      state: string;
    }>(
      `WITH RECURSIVE chain AS (
           SELECT a.nomination_id, a.list_position, a.adopted_item_id AS item_id, 0 AS depth
             FROM acquisition_campaign_continuations a WHERE a.campaign_id = $1
           UNION ALL
           SELECT c.nomination_id, c.list_position, w.id, c.depth + 1
             FROM chain c JOIN acquisition_work_items w ON w.parent_item_id = c.item_id)
       SELECT DISTINCT ON (c.nomination_id)
              c.nomination_id AS nomination, c.list_position AS position, s.stage, s.state
         FROM chain c JOIN acquisition_work_item_states s ON s.work_item_id = c.item_id
        ORDER BY c.nomination_id, c.depth DESC`,
      [campaignId],
    );
    return rows.sort((a, b) => a.position - b.position);
  }

  /** No item of the campaign is left open before the human gate. */
  async function openBeforeReview(campaignId: string): Promise<number> {
    const { rows } = await h.admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM acquisition_work_item_states
        WHERE campaign_id = $1
          AND stage IN ('NOMINATED', 'DEDUPLICATED', 'RESEARCH_PENDING', 'RESEARCHED')
          AND state IN ('PENDING', 'CLAIMED', 'LEASE_EXPIRED', 'RETRY_SCHEDULED')`,
      [campaignId],
    );
    return rows[0]!.n;
  }

  // -------------------------------------------------------------------------

  it('adopts exactly the lineages the signed budgets carry, in signed order; every one reaches the identity review', async () => {
    const pred = await predecessor();
    const listed = ORDER.slice(0, 5).map((d) => pred.nom[d]!);
    // 2 research roots carry 2 lineages (150 gateway requests would carry 2 as well).
    const id = await continuation(pred, listed, {
      maxResearchRoots: '2',
      maxGatewayRequests: '150',
      maxWorkItems: '40',
    });

    const summary = await work(id);
    expect(summary.stopReason).toBe('QUEUE_DRAINED');
    expect(summary.continuation).toEqual({
      predecessorCampaignId: pred.id,
      listed: 5,
      adopted: listed.slice(0, 2).map((nominationId, i) => ({
        nominationId,
        position: i + 1,
        itemId: expect.any(String) as unknown as string,
      })),
      alreadyAdopted: 0,
      skipped: listed.slice(2).map((nominationId, i) => ({
        nominationId,
        position: i + 3,
        reason: 'NO_PROCESSING_ALLOCATION',
      })),
      interrupted: false,
    });

    // EVERY adopted lineage reached the OWNER's identity review; none is left before it.
    expect(await lineages(id)).toEqual(
      listed.slice(0, 2).map((nomination, i) => ({
        nomination,
        position: i + 1,
        stage: 'IDENTITY_REVIEW',
        state: 'AWAITING_HUMAN',
      })),
    );
    expect(await openBeforeReview(id)).toBe(0);

    // The unadopted nominations are untouched: no adoption row, nothing in any campaign.
    const { rows: untouched } = await h.admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM acquisition_campaign_continuations
        WHERE nomination_id = ANY ($1::uuid[])`,
      [listed.slice(2)],
    );
    expect(untouched[0]!.n).toBe(0);

    const status = await loadAcquisitionStatusV1(h.readonly, id, h.campaignTrust);
    expect(status?.continuation).toEqual({
      predecessorCampaignId: pred.id,
      listed: 5,
      adopted: 2,
      pending: 0,
      skipped: listed.slice(2).map((nominationId, i) => ({
        nominationId,
        position: i + 3,
        reason: 'NO_PROCESSING_ALLOCATION',
      })),
    });
    expect(status?.budgets.maxResearchRoots).toMatchObject({ limit: 2, used: 2, remaining: 0 });

    // JUST IN TIME: lineage 2 was adopted only after lineage 1 reached the identity review
    // (maxConcurrency 1), so a STOP could never have left both of them unfinished.
    const { rows: timing } = await h.admin.query<{ adopted2: Date; review1: Date }>(
      `SELECT (SELECT created_at FROM acquisition_campaign_continuations
                WHERE campaign_id = $1 AND list_position = 2) AS adopted2,
              (SELECT i.created_at FROM acquisition_work_items i
                WHERE i.campaign_id = $1 AND i.stage = 'IDENTITY_REVIEW'
                  AND i.registrable_domain = $2) AS review1`,
      [id, ORDER[0]],
    );
    expect(timing[0]!.adopted2.getTime()).toBeGreaterThanOrEqual(timing[0]!.review1.getTime());
  });

  it("the OWNER's R2-P3 numbers: 16 listed, 8 roots, 600 gateway requests, 400 work items - 8 adopted, all reviewed, 8 left untouched", async () => {
    const pred = await predecessor();
    const listed = ORDER.map((d) => pred.nom[d]!);
    const id = await continuation(pred, listed, {
      maxResearchRoots: '8',
      maxGatewayRequests: '600',
      maxWorkItems: '400',
    });

    const summary = await work(id);
    expect(summary.stopReason).toBe('QUEUE_DRAINED');
    expect(summary.continuation?.adopted.map((a) => a.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(summary.continuation?.skipped).toEqual(
      listed.slice(8).map((nominationId, i) => ({
        nominationId,
        position: i + 9,
        reason: 'NO_PROCESSING_ALLOCATION',
      })),
    );
    const heads = await lineages(id);
    expect(heads).toHaveLength(8);
    expect(heads.every((l) => l.stage === 'IDENTITY_REVIEW' && l.state === 'AWAITING_HUMAN')).toBe(
      true,
    );
    expect(await openBeforeReview(id)).toBe(0);
    // 8 lineages x 5 items so far; each still needs its OWNER release (1 item each), which fits.
    const usage = await loadCampaignUsage(h.admin, id);
    expect(usage).toMatchObject({ workItems: 40, researchRoots: 8, searchRuns: 0 });
    expect(400 - usage.workItems).toBeGreaterThanOrEqual(8);
    expect(usage.gatewayRequests).toBeLessThanOrEqual(600);
  });

  it('concurrent workers cannot over-adopt: the allocation is decided under the campaign lock', async () => {
    const pred = await predecessor();
    const listed = ORDER.slice(0, 5).map((d) => pred.nom[d]!);
    const id = await continuation(pred, listed, { maxResearchRoots: '2', maxWorkItems: '40' });
    const derived = await deriveCampaignAuthority(h.worker, id, { trust: h.campaignTrust });
    if (!derived.ok) throw new Error(derived.code);
    const scope = continuationScopeCheck(() => h.readonly);
    const reports = await Promise.all(
      [1, 2, 3].map(() => adoptContinuation(h.worker, derived.authority, scope)),
    );
    const adopted = reports.flatMap((r) => r!.adopted.map((a) => a.position)).sort();
    expect(adopted).toEqual([1, 2]);
    for (const r of reports) {
      expect(
        r!.skipped.filter((k) => k.reason === 'NO_PROCESSING_ALLOCATION').map((k) => k.position),
      ).toEqual([3, 4, 5]);
    }
    const { rows } = await h.admin.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM acquisition_campaign_continuations WHERE campaign_id = $1',
      [id],
    );
    expect(rows[0]!.n).toBe(2);
  });

  it('is recoverable: after the OWNER stops it, a NEW v3 campaign adopts the nominations it left', async () => {
    const pred = await predecessor();
    const listed = ORDER.slice(0, 5).map((d) => pred.nom[d]!);
    const first = await continuation(pred, listed, { maxResearchRoots: '2', maxWorkItems: '40' });
    expect((await work(first)).continuation?.adopted).toHaveLength(2);
    await control(first, 'STOP');

    // The OWNER signs a new continuation of the SAME predecessor for the three left over.
    const second = await continuation(pred, listed.slice(2), {
      maxResearchRoots: '3',
      maxWorkItems: '40',
    });
    const summary = await work(second);
    expect(summary.stopReason).toBe('QUEUE_DRAINED');
    expect(summary.continuation).toMatchObject({
      adopted: listed.slice(2).map((nominationId, i) => ({ nominationId, position: i + 1 })),
      skipped: [],
    });
    expect((await lineages(second)).map((l) => [l.stage, l.state])).toEqual(
      Array(3).fill(['IDENTITY_REVIEW', 'AWAITING_HUMAN']),
    );
    // Every one of the five listed nominations is adopted exactly once, across both campaigns.
    const { rows } = await h.admin.query<{ n: number }>(
      `SELECT count(DISTINCT nomination_id)::int AS n FROM acquisition_campaign_continuations
        WHERE nomination_id = ANY ($1::uuid[])`,
      [listed],
    );
    expect(rows[0]!.n).toBe(5);
  });

  it('a lineage refused at de-duplication frees its allocation: the next listed nomination is adopted', async () => {
    const pred = await predecessor();
    const [dup, x2, x3] = ORDER.slice(0, 3);
    // The first listed domain became an ECHE website claim since: de-duplication refuses it.
    await h.echeClaim(dup!);
    const listed = [dup!, x2!, x3!].map((d) => pred.nom[d]!);
    const id = await continuation(pred, listed, { maxResearchRoots: '1', maxWorkItems: '40' });

    // One root: only the first listed nomination has an allocation at the start.
    const once = await runWorker({
      pool: h.worker,
      campaignId: id,
      workerId: 'test-allocation-worker',
      handlers: createStageHandlers(h.deps(fakeSdk(RESULTS), transport())),
      continuationScope: continuationScopeCheck(() => h.readonly),
      trust: h.campaignTrust,
      ...FAST,
      maxItems: 1,
    });
    expect(once.continuation?.adopted.map((a) => a.nominationId)).toEqual([listed[0]]);
    expect(once.outcomes.REFUSED_TERMINAL).toBe(1);
    // Its refusal used no root, so the next start has an allocation for exactly one more.
    const status = await loadAcquisitionStatusV1(h.readonly, id, h.campaignTrust);
    expect(status?.continuation).toMatchObject({
      adopted: 1,
      pending: 1,
      skipped: [{ nominationId: listed[2], position: 3, reason: 'NO_PROCESSING_ALLOCATION' }],
    });

    const next = await work(id);
    expect(next.stopReason).toBe('QUEUE_DRAINED');
    expect(next.continuation).toMatchObject({
      adopted: [{ nominationId: listed[1], position: 2 }],
      alreadyAdopted: 1,
      skipped: [{ nominationId: listed[2], position: 3, reason: 'NO_PROCESSING_ALLOCATION' }],
    });
    expect(await lineages(id)).toEqual([
      { nomination: listed[0], position: 1, stage: 'NOMINATED', state: 'REFUSED_TERMINAL' },
      { nomination: listed[1], position: 2, stage: 'IDENTITY_REVIEW', state: 'AWAITING_HUMAN' },
    ]);
    expect(await openBeforeReview(id)).toBe(0);
  });

  it("a LINK_OUT lineage is never claimed into an adopted lineage's research allocation", async () => {
    const pred = await predecessor();
    // alpha's research page links out; the campaign lists LINK_OUT, so it becomes a root.
    const listed = ['alloc-alpha-fict.jp', 'alloc-bravo-fict.jp'].map((d) => pred.nom[d]!);
    const id = await continuation(pred, listed, { maxResearchRoots: '2', maxWorkItems: '40' }, [
      'SEARCH_GRANT',
      'LINK_OUT',
    ]);

    const summary = await work(id);
    expect(summary.continuation?.adopted.map((a) => a.nominationId)).toEqual(listed);
    expect(await lineages(id)).toEqual(
      listed.map((nomination, i) => ({
        nomination,
        position: i + 1,
        stage: 'IDENTITY_REVIEW',
        state: 'AWAITING_HUMAN',
      })),
    );
    // The link-out lineage reached RESEARCH_PENDING but was never claimed: both roots
    // went to the adopted lineages, and nothing is left for it.
    const { rows } = await h.admin.query<{ stage: string; state: string; claims: number }>(
      `SELECT s.stage, s.state,
              (SELECT count(*)::int FROM acquisition_work_claims c
                WHERE c.work_item_id = s.work_item_id) AS claims
         FROM acquisition_work_item_states s
        WHERE s.campaign_id = $1 AND s.source_kind = 'LINK_OUT' AND s.stage = 'RESEARCH_PENDING'`,
      [id],
    );
    expect(rows).toEqual([{ stage: 'RESEARCH_PENDING', state: 'PENDING', claims: 0 }]);
    expect(summary.stopReason).toBe('BUDGET_EXHAUSTED');
    expect((await loadCampaignUsage(h.admin, id)).researchRoots).toBe(2);
  });

  it('a LINK_OUT lineage cannot take the work items an adopted lineage still needs for its OWNER release', async () => {
    const pred = await predecessor();
    const listed = [pred.nom['alloc-alpha-fict.jp']!];
    // 6 items carry alpha's lineage to ASSESSABLE; the 7th is all that is left for its link-out.
    const id = await continuation(pred, listed, { maxResearchRoots: '2', maxWorkItems: '7' }, [
      'SEARCH_GRANT',
      'LINK_OUT',
    ]);
    await work(id);
    expect(await lineages(id)).toEqual([
      { nomination: listed[0], position: 1, stage: 'IDENTITY_REVIEW', state: 'AWAITING_HUMAN' },
    ]);
    // The link-out root took the spare item; its nomination child was refused, so the
    // OWNER's release of alpha (one more item) still fits the signed budget.
    const { rows } = await h.admin.query<{ refusals: string[] }>(
      `SELECT o.child_refusals AS refusals FROM acquisition_work_outcomes o
         JOIN acquisition_work_items i ON i.id = o.work_item_id
        WHERE i.campaign_id = $1 AND i.source_kind = 'LINK_OUT' AND i.stage = 'DISCOVERED'`,
      [id],
    );
    expect(rows).toEqual([{ refusals: ['WORK_ITEM_BUDGET_EXHAUSTED'] }]);
    expect((await loadCampaignUsage(h.admin, id)).workItems).toBe(6);
  });
});

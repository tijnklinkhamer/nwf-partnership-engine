/**
 * R2 (migration 0029, ADR 0029 s12) - a NEW OWNER-signed v3 campaign
 * CONTINUES the stranded nominations of a named, STOPPED predecessor,
 * against a DISPOSABLE PostgreSQL.
 *
 * The production shape, reproduced synthetically: a predecessor whose signed
 * maxWorkItems is spent by its search root and its NOMINATED items, so every
 * nomination passes de-duplication (ADVANCED) but none receives a child. The
 * OWNER stops it; a v3 campaign lists a subset IN ORDER; the worker adopts
 * them in that order, charged to the NEW campaign's budgets, idempotently,
 * through the unchanged de-duplication and promotion handlers - and refuses,
 * by name, everything the database and the signed document do not allow.
 *
 * Nothing here reaches a network, a model or a real organisation.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  adoptContinuation,
  claimSpecificWorkItem,
  inWorkerTransaction,
  loadCampaignUsage,
  recordWorkOutcome,
} from '../../orgunits/acquisition/store.js';
import {
  deriveCampaignAuthority,
  enqueueOwnerRoot,
  recordCampaign,
  recordControlEvent,
  runWorker,
  WORKER_STAGES,
  type WorkItemView,
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
import { researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;
const FAST = { idleSleepMs: 10, idleTimeoutMs: 300, controlPollMs: 20, leaseSeconds: 120 } as const;
const REUSE_STAGES = ['NOMINATED', 'DEDUPLICATED', 'RESEARCH_PENDING'];
/** The default continuation stages: the adopted items stop AT RESEARCH_PENDING (not researched here). */
const TO_RESEARCH_PENDING = ['NOMINATED', 'DEDUPLICATED'];

/** Five fictitious language-exchange organisations, found by one granted JP search. */
const RESULTS: readonly FakeResult[] = [
  ['https://www.cont-alpha-fict.jp/', 'Alpha Tandem Circle'],
  ['https://www.cont-bravo-fict.jp/', 'Bravo Language Cafe'],
  ['https://www.cont-charlie-fict.jp/', 'Charlie Exchange Club'],
  ['https://www.cont-delta-fict.jp/', 'Delta Conversation Society'],
  ['https://www.cont-echo-fict.jp/', 'Echo Buddy Network'],
];
const DOMAINS = RESULTS.map(([url]) => new URL(url).hostname.replace(/^www\./, ''));

describeDb('R2 campaign continuation (integration)', () => {
  let h: WiringHarness;

  beforeAll(async () => {
    h = await createWiringHarness('acqr2');
  });
  afterAll(async () => {
    await truncateWiring(h.admin);
    await h.tearDown();
  });
  beforeEach(async () => {
    await truncateWiring(h.admin);
  });

  async function record(draft: Parameters<typeof signedCampaign>[1], start = true) {
    const r = await recordCampaign(
      h.admin,
      Buffer.from(signedCampaign(h.campaignKey, draft)),
      { actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );
    if (start) await control(r.campaignId, 'START');
    return r.campaignId;
  }

  const control = (campaignId: string, action: 'START' | 'STOP') =>
    recordControlEvent(
      h.admin,
      { campaignId, action, actorKey: 'owner-cli' },
      { trust: h.campaignTrust },
    );

  const work = (campaignId: string, sdk = fakeSdk(RESULTS)) =>
    runWorker({
      pool: h.worker,
      campaignId,
      workerId: 'test-continuation-worker',
      handlers: createStageHandlers(h.deps(sdk, researchTransport())),
      continuationScope: continuationScopeCheck(() => h.readonly),
      trust: h.campaignTrust,
      ...FAST,
    });

  const count = async (sql: string, params: unknown[] = []): Promise<number> =>
    (await h.admin.query<{ n: number }>(sql, params)).rows[0]!.n;

  /**
   * A predecessor whose signed work-item budget the search spends: one root
   * plus five NOMINATED items is 6. With `maxWorkItems` 6 every nomination is
   * ADVANCED with no child (stranded); with 7, the first one gets its child.
   */
  async function predecessor(maxWorkItems = '6') {
    await h.verifySmokeRuntime();
    const grantId = await h.grant('JP');
    const id = await record({
      environmentId: h.environmentId,
      geographies: ['JP'],
      sourceKinds: ['SEARCH_GRANT'],
      stages: [...WORKER_STAGES],
      searchGrantIds: [grantId],
      budgets: { maxConcurrency: '1', maxWorkItems },
    });
    const summary = await work(id);
    expect(summary.stopReason).toBe('QUEUE_DRAINED');
    const { rows } = await h.admin.query<{
      domain: string;
      nomination: string;
      item: string;
      outcome: string;
      children: number;
    }>(
      `SELECT s.registrable_domain AS domain, s.subject_id AS nomination, s.work_item_id AS item,
              s.state AS outcome,
              (SELECT count(*)::int FROM acquisition_work_items c
                WHERE c.parent_item_id = s.work_item_id) AS children
         FROM acquisition_work_item_states s
        WHERE s.campaign_id = $1 AND s.stage = 'NOMINATED'`,
      [id],
    );
    expect(rows.map((r) => r.domain).sort()).toEqual([...DOMAINS].sort());
    expect(rows.every((r) => r.outcome === 'ADVANCED')).toBe(true);
    const nom = Object.fromEntries(rows.map((r) => [r.domain, r]));
    return { id, grantId, nom, rows };
  }

  async function continuation(
    pred: { id: string; grantId: string },
    nominationIds: string[],
    over: { geographies?: string[]; stages?: string[]; budgets?: Record<string, string> } = {},
    start = true,
  ) {
    return record(
      {
        environmentId: h.environmentId,
        geographies: over.geographies ?? ['JP'],
        sourceKinds: ['SEARCH_GRANT'],
        stages: over.stages ?? TO_RESEARCH_PENDING,
        searchGrantIds: [pred.grantId],
        budgets: { maxConcurrency: '1', maxSearchRuns: '0', maxWorkItems: '9', ...over.budgets },
        continuation: { predecessorCampaignId: pred.id, nominationIds },
      },
      start,
    );
  }

  /** One adoption INSERT as the worker capability; returns the database's refusal text or 'OK'. */
  async function insertAdoption(row: {
    campaignId: string;
    predecessorId: string;
    predecessorItemId: string;
    nominationId: string;
    position: number;
  }): Promise<string> {
    try {
      await inWorkerTransaction(h.worker, async (c) => {
        const { rows } = await c.query<{ id: string }>('SELECT gen_random_uuid() AS id');
        await c.query(
          `INSERT INTO acquisition_campaign_continuations
             (campaign_id, predecessor_campaign_id, predecessor_item_id, nomination_id,
              adopted_item_id, list_position)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            row.campaignId,
            row.predecessorId,
            row.predecessorItemId,
            row.nominationId,
            rows[0]!.id,
            row.position,
          ],
        );
      });
      return 'OK';
    } catch (error) {
      return (error as Error).message;
    }
  }

  // -------------------------------------------------------------------------

  it('adopts the listed stranded nominations IN SIGNED ORDER, charged to the NEW budget, once', async () => {
    const pred = await predecessor();
    expect(pred.rows.every((r) => r.children === 0)).toBe(true);
    const predUsage = await loadCampaignUsage(h.admin, pred.id);
    expect(predUsage.workItems).toBe(6);
    const nominationsBefore = await count(
      'SELECT count(*)::int AS n FROM source_discovery_nominations',
    );
    const identitiesBefore = await count(
      'SELECT count(*)::int AS n FROM source_discovery_nomination_identities',
    );
    await control(pred.id, 'STOP');

    // The OWNER's priority: delta, alpha, charlie (not the lexical order).
    const order = ['cont-delta-fict.jp', 'cont-alpha-fict.jp', 'cont-charlie-fict.jp'];
    const listed = order.map((d) => pred.nom[d]!.nomination);
    const id = await continuation(pred, listed);
    const sdk = fakeSdk(RESULTS);

    const first = await work(id, sdk);
    expect(first.stopReason).toBe('QUEUE_DRAINED');
    expect(first.continuation).toEqual({
      predecessorCampaignId: pred.id,
      listed: 3,
      adopted: listed.map((nominationId, i) => ({
        nominationId,
        position: i + 1,
        itemId: expect.any(String) as unknown as string,
      })),
      alreadyAdopted: 0,
      skipped: [],
      interrupted: false,
    });

    // One append-only adoption per listed nomination, at its signed position.
    const { rows: adoptions } = await h.admin.query<{
      nomination: string;
      position: number;
      predecessorItem: string;
    }>(
      `SELECT nomination_id AS nomination, list_position AS position,
              predecessor_item_id AS "predecessorItem"
         FROM acquisition_campaign_continuations WHERE campaign_id = $1 ORDER BY list_position`,
      [id],
    );
    expect(adoptions).toEqual(
      listed.map((n, i) => ({
        nomination: n,
        position: i + 1,
        predecessorItem: pred.nom[order[i]!]!.item,
      })),
    );

    // The adopted NOMINATED items were CLAIMED in the signed order, and are never the predecessor's children.
    const { rows: claimed } = await h.admin.query<{ subject: string; parent: string | null }>(
      `SELECT i.subject_id AS subject, i.parent_item_id AS parent
         FROM acquisition_work_claims c JOIN acquisition_work_items i ON i.id = c.work_item_id
        WHERE c.campaign_id = $1 AND i.stage = 'NOMINATED'
        ORDER BY c.claimed_at, c.id`,
      [id],
    );
    expect(claimed.map((c) => c.subject)).toEqual(listed);
    expect(claimed.every((c) => c.parent === null)).toBe(true);

    // Through the UNCHANGED dedupe and promotion handlers, to RESEARCH_PENDING.
    const { rows: stages } = await h.admin.query<{ stage: string; state: string; n: number }>(
      `SELECT stage, state, count(*)::int AS n FROM acquisition_work_item_states
        WHERE campaign_id = $1 GROUP BY 1, 2 ORDER BY 1, 2`,
      [id],
    );
    expect(stages).toEqual([
      { stage: 'DEDUPLICATED', state: 'ADVANCED', n: 3 },
      { stage: 'NOMINATED', state: 'ADVANCED', n: 3 },
      { stage: 'RESEARCH_PENDING', state: 'PENDING', n: 3 },
    ]);
    expect(
      await count(
        `SELECT count(*)::int AS n FROM acquisition_campaign_subjects WHERE campaign_id = $1`,
        [id],
      ),
    ).toBe(3);

    // Charged to the NEW campaign's signed budget; the predecessor's is untouched.
    const usage = await loadCampaignUsage(h.admin, id);
    expect(usage).toMatchObject({ workItems: 9, searchRuns: 0, researchRoots: 0 });
    expect((await loadCampaignUsage(h.admin, pred.id)).workItems).toBe(6);
    // maxSearchRuns 0: no search root at all, and no search was made.
    expect(
      await count(
        `SELECT count(*)::int AS n FROM acquisition_work_items
          WHERE campaign_id = $1 AND stage = 'DISCOVERED'`,
        [id],
      ),
    ).toBe(0);
    expect(sdk.calls()).toBe(0);
    // No nomination, identity or sighting was created or merged.
    expect(await count('SELECT count(*)::int AS n FROM source_discovery_nominations')).toBe(
      nominationsBefore,
    );
    expect(
      await count('SELECT count(*)::int AS n FROM source_discovery_nomination_identities'),
    ).toBe(identitiesBefore);

    const status = await loadAcquisitionStatusV1(h.readonly, id, h.campaignTrust);
    expect(status?.continuation).toEqual({
      predecessorCampaignId: pred.id,
      listed: 3,
      adopted: 3,
      pending: 0,
      skipped: [],
    });
    expect(status?.budgets.maxWorkItems).toEqual({ limit: 9, used: 9, remaining: 0 });
    expect(
      (await loadAcquisitionStatusV1(h.readonly, pred.id, h.campaignTrust))?.continuation,
    ).toBe(null);

    // A second start adopts nothing new.
    const second = await work(id, sdk);
    expect(second.continuation).toMatchObject({ adopted: [], alreadyAdopted: 3, skipped: [] });
    expect(await count(`SELECT count(*)::int AS n FROM acquisition_campaign_continuations`)).toBe(
      3,
    );
    expect((await loadCampaignUsage(h.admin, id)).workItems).toBe(9);
  });

  it('refuses while the predecessor is not STOPPED, then adopts once the OWNER stops it', async () => {
    const pred = await predecessor();
    const listed = [pred.nom['cont-bravo-fict.jp']!.nomination];
    const id = await continuation(pred, listed);

    const blocked = await work(id);
    expect(blocked.continuation).toMatchObject({
      adopted: [],
      skipped: [{ nominationId: listed[0], position: 1, reason: 'PREDECESSOR_NOT_STOPPED' }],
    });
    expect(
      await insertAdoption({
        campaignId: id,
        predecessorId: pred.id,
        predecessorItemId: pred.nom['cont-bravo-fict.jp']!.item,
        nominationId: listed[0]!,
        position: 1,
      }),
    ).toMatch(/PREDECESSOR_NOT_STOPPED/);
    expect(
      (await loadAcquisitionStatusV1(h.readonly, id, h.campaignTrust))?.continuation?.skipped,
    ).toEqual([{ nominationId: listed[0], position: 1, reason: 'PREDECESSOR_NOT_STOPPED' }]);

    await control(pred.id, 'STOP');
    const adopted = await work(id);
    expect(adopted.continuation?.adopted.map((a) => a.nominationId)).toEqual(listed);
  });

  it('names every refusal: a child, another campaign, the geography, an unlisted id', async () => {
    const pred = await predecessor('7');
    const withChild = pred.rows.find((r) => r.children === 1)!;
    const stranded = pred.rows.filter((r) => r.children === 0);
    expect(stranded).toHaveLength(4);
    await control(pred.id, 'STOP');
    const [x1, x2, x3, x4] = stranded.map((r) => r.nomination);

    const a = await continuation(pred, [x1!, withChild.nomination]);
    const ra = await work(a);
    expect(ra.continuation).toMatchObject({
      adopted: [{ nominationId: x1, position: 1 }],
      skipped: [{ nominationId: withChild.nomination, position: 2, reason: 'HAS_CHILD' }],
    });

    const b = await continuation(pred, [x1!, x2!]);
    const rb = await work(b);
    expect(rb.continuation).toMatchObject({
      adopted: [{ nominationId: x2, position: 2 }],
      skipped: [{ nominationId: x1, position: 1, reason: 'ADOPTED_BY_ANOTHER_CAMPAIGN' }],
    });

    const c = await continuation(pred, [x3!], { geographies: ['NL'] });
    const rc = await work(c);
    expect(rc.continuation).toMatchObject({
      adopted: [],
      skipped: [{ nominationId: x3, position: 1, reason: 'OUT_OF_SCOPE' }],
    });
    expect(
      (await loadAcquisitionStatusV1(h.readonly, c, h.campaignTrust))?.continuation?.skipped,
    ).toEqual([{ nominationId: x3, position: 1, reason: 'OUT_OF_SCOPE' }]);

    // The database refuses what the worker never tries.
    const itemOf = (n: string) => pred.rows.find((r) => r.nomination === n)!.item;
    expect(
      await insertAdoption({
        campaignId: b,
        predecessorId: pred.id,
        predecessorItemId: itemOf(x4!),
        nominationId: x4!,
        position: 3,
      }),
    ).toMatch(/NOT_LISTED/);
    expect(
      await insertAdoption({
        campaignId: a,
        predecessorId: pred.id,
        predecessorItemId: withChild.item,
        nominationId: withChild.nomination,
        position: 2,
      }),
    ).toMatch(/HAS_CHILD/);
    // A second adoption of an adopted nomination, even by its own campaign, is a unique violation.
    expect(
      await insertAdoption({
        campaignId: a,
        predecessorId: pred.id,
        predecessorItemId: itemOf(x1!),
        nominationId: x1!,
        position: 1,
      }),
    ).toMatch(/duplicate key|unique/i);
    // A campaign continuing a predecessor its signed document does not name is refused.
    expect(
      await insertAdoption({
        campaignId: a,
        predecessorId: b,
        predecessorItemId: itemOf(x4!),
        nominationId: x4!,
        position: 1,
      }),
    ).toMatch(/CONTINUATION_NOT_SIGNED/);
    expect(await count(`SELECT count(*)::int AS n FROM acquisition_campaign_continuations`)).toBe(
      2,
    );
  });

  it('refuses a LINK_OUT nomination (only SEARCH_GRANT items are continued)', async () => {
    const searchPred = await predecessor();
    const nomination = searchPred.rows[0]!.nomination;
    const domain = searchPred.rows[0]!.domain;
    // A LINK_OUT predecessor, built on the owner path: one root, one NOMINATED child, budget 2.
    const linkPred = await record({
      environmentId: h.environmentId,
      geographies: ['JP'],
      sourceKinds: ['LINK_OUT'],
      stages: ['DISCOVERED', 'NOMINATED'],
      budgets: { maxConcurrency: '1', maxWorkItems: '2' },
    });
    const root = await enqueueOwnerRoot(h.admin, {
      campaignId: linkPred,
      sourceKind: 'LINK_OUT',
      subjectId: '99999999-0000-4000-8000-000000000009',
    });
    expect(root.kind).toBe('INSERTED');
    const advance = async (itemId: string, children?: WorkItemView[]) => {
      const { rows } = await h.admin.query<{
        id: string;
        campaign_id: string;
        stage: WorkItemView['stage'];
        source_kind: WorkItemView['sourceKind'];
        subject_kind: WorkItemView['subjectKind'];
        subject_id: string;
        registrable_domain: string | null;
        parent_item_id: string | null;
        priority: number;
        idempotency_key: string;
      }>('SELECT * FROM acquisition_work_items WHERE id = $1', [itemId]);
      const r = rows[0]!;
      const claimId = await claimSpecificWorkItem(h.worker, {
        campaignId: linkPred,
        workItemId: itemId,
        attemptNo: 1,
        workerId: 'test-continuation-worker',
        leaseSeconds: 120,
      });
      const item: WorkItemView = {
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
      };
      return recordWorkOutcome(
        h.worker,
        {
          claimId,
          attemptNo: 1,
          workerId: 'test-continuation-worker',
          leaseExpiresAtMs: Date.now() + 120_000,
          reserved: { searchRuns: 0, researchRoots: 0, gatewayRequests: 0 },
          item,
        },
        {
          kind: 'ADVANCED',
          nextStage: r.stage === 'DISCOVERED' ? 'NOMINATED' : 'DEDUPLICATED',
          children: (children ?? [item]).map((c) => ({
            subjectKind: c.subjectKind,
            subjectId: c.subjectId,
            registrableDomain: c.registrableDomain,
          })),
        },
        { searchRuns: 0, researchRoots: 0, gatewayRequests: 0 },
        'test-continuation-worker',
      );
    };
    const first = await advance((root as { id: string }).id, [
      {
        subjectKind: 'NOMINATION',
        subjectId: nomination,
        registrableDomain: domain,
      } as WorkItemView,
    ]);
    const nominatedId = first.producedChildIds[0]!;
    const second = await advance(nominatedId);
    expect(second.childRefusals).toEqual(['WORK_ITEM_BUDGET_EXHAUSTED']);
    await control(linkPred, 'STOP');

    const id = await continuation({ id: linkPred, grantId: searchPred.grantId }, [nomination]);
    const r = await work(id);
    expect(r.continuation).toMatchObject({
      adopted: [],
      skipped: [{ nominationId: nomination, position: 1, reason: 'SOURCE_KIND_NOT_SEARCH_GRANT' }],
    });
    expect(
      await insertAdoption({
        campaignId: id,
        predecessorId: linkPred,
        predecessorItemId: nominatedId,
        nominationId: nomination,
        position: 1,
      }),
    ).toMatch(/SOURCE_KIND_NOT_SEARCH_GRANT/);
  });

  it('survives a crash between adoption and processing: nothing is adopted or processed twice', async () => {
    const pred = await predecessor();
    await control(pred.id, 'STOP');
    const listed = pred.rows.slice(0, 2).map((r) => r.nomination);
    const id = await continuation(pred, listed);

    // A worker start that adopts and then dies before claiming anything.
    const derived = await deriveCampaignAuthority(h.worker, id, { trust: h.campaignTrust });
    if (!derived.ok) throw new Error(derived.code);
    const report = await adoptContinuation(
      h.worker,
      derived.authority,
      continuationScopeCheck(() => h.readonly),
    );
    expect(report?.adopted.map((a) => a.nominationId)).toEqual(listed);
    expect(
      await count(`SELECT count(*)::int AS n FROM acquisition_work_claims WHERE campaign_id = $1`, [
        id,
      ]),
    ).toBe(0);
    // A racing second adoption (another worker) adopts nothing.
    const again = await adoptContinuation(
      h.worker,
      derived.authority,
      continuationScopeCheck(() => h.readonly),
    );
    expect(again).toMatchObject({ adopted: [], alreadyAdopted: 2, skipped: [] });

    const resumed = await work(id);
    expect(resumed.continuation).toMatchObject({ adopted: [], alreadyAdopted: 2 });
    expect(
      await count(
        `SELECT count(*)::int AS n FROM acquisition_work_claims c
           JOIN acquisition_work_items i ON i.id = c.work_item_id
          WHERE c.campaign_id = $1 AND i.stage = 'NOMINATED'`,
        [id],
      ),
    ).toBe(2);
    expect((await loadCampaignUsage(h.admin, id)).workItems).toBe(6);

    // An adoption without its item can never commit (deferred foreign key), and
    // a parentless NOMINATED item without its adoption row is refused.
    const third = pred.rows[2]!;
    const lone = await continuation(pred, [third.nomination]);
    expect(
      await insertAdoption({
        campaignId: lone,
        predecessorId: pred.id,
        predecessorItemId: third.item,
        nominationId: third.nomination,
        position: 1,
      }),
    ).toMatch(/foreign key/i);
    await expect(
      inWorkerTransaction(h.worker, (c) =>
        c.query(
          `INSERT INTO acquisition_work_items
             (campaign_id, stage, source_kind, subject_kind, subject_id, registrable_domain,
              idempotency_key, parent_item_id, priority)
           VALUES ($1, 'NOMINATED', 'SEARCH_GRANT', 'NOMINATION', $2, $3, $4, NULL, 100)`,
          [lone, third.nomination, third.domain, `NOMINATED|NOMINATION:${third.nomination}`],
        ),
      ),
    ).rejects.toThrow(/CONTINUATION_NOT_ADOPTED/);
    expect(await count(`SELECT count(*)::int AS n FROM acquisition_campaign_continuations`)).toBe(
      2,
    );
  });

  it('reuses before it searches: the search root is seeded only after the adopted items moved on', async () => {
    const pred = await predecessor();
    await control(pred.id, 'STOP');
    const listed = pred.rows.slice(0, 2).map((r) => r.nomination);
    const id = await continuation(pred, listed, {
      stages: ['DISCOVERED', 'NOMINATED', 'DEDUPLICATED'],
      budgets: { maxSearchRuns: '1', maxWorkItems: '20' },
    });
    const sdk = fakeSdk(RESULTS);
    const r = await work(id, sdk);
    expect(r.continuation?.adopted).toHaveLength(2);
    expect(sdk.calls()).toBe(1);
    const { rows } = await h.admin.query<{ root: Date; last: Date }>(
      `SELECT (SELECT min(created_at) FROM acquisition_work_items
                WHERE campaign_id = $1 AND stage = 'DISCOVERED') AS root,
              (SELECT max(o.recorded_at) FROM acquisition_work_outcomes o
                 JOIN acquisition_work_items i ON i.id = o.work_item_id
                WHERE i.campaign_id = $1 AND i.stage IN ('NOMINATED', 'DEDUPLICATED')
                  AND i.subject_id = ANY ($2::uuid[])) AS last`,
      [id, listed],
    );
    expect(rows[0]!.root).not.toBeNull();
    expect(rows[0]!.root.getTime()).toBeGreaterThanOrEqual(rows[0]!.last.getTime());
  });

  it('refuses to record a v3 campaign whose predecessor does not exist', async () => {
    await expect(
      record({
        environmentId: h.environmentId,
        geographies: ['JP'],
        sourceKinds: ['SEARCH_GRANT'],
        stages: REUSE_STAGES,
        budgets: { maxSearchRuns: '0' },
        continuation: {
          predecessorCampaignId: '77777777-0000-4000-8000-000000000007',
          nominationIds: ['88888888-0000-4000-8000-000000000008'],
        },
      }),
    ).rejects.toMatchObject({ code: 'CONTINUATION_INVALID' });
  });
});

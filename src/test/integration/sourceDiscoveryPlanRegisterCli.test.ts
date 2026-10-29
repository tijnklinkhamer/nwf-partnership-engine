/**
 * WW R2 E-1 - `orgunits source-discovery plan register --execute` registers
 * ONE plan on the OWNER path, idempotently, and the row it writes is exactly
 * the one an OWNER grant row can name (migration 0022's composite foreign key
 * to source_discovery_briefs(id, plan_digest)) and the one a granted run
 * re-derives byte for byte. Disposable test database only; nothing searches.
 */
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { runSourceDiscoveryCli } from '../../cli/commands/sourceDiscovery.js';
import { NWF_DISCOVERY_BRIEF_V1, briefDigest } from '../../orgunits/sourceDiscovery/brief.js';
import { SOURCE_DISCOVERY_ALLOWED_MODELS } from '../../orgunits/sourceDiscovery/grant.js';
import {
  planDiscoveryQueries,
  rederiveStoredPlan,
} from '../../orgunits/sourceDiscovery/planner/plan.js';
import { DISCOVERY_PLAN_VERSION } from '../../orgunits/sourceDiscovery/planner/vocabulary.js';
import { adminPool, researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

const NO_POOL = () => {
  throw new Error('plan register must use the OWNER-path pool only');
};

describeDb('orgunits source-discovery plan register --execute (OWNER path)', () => {
  const admin = adminPool();
  let ownerPoolsOpened = 0;

  afterAll(async () => {
    await admin.end();
  });

  async function cli(argv: readonly string[]) {
    let out = '';
    const exit = await runSourceDiscoveryCli(['source-discovery', 'plan', 'register', ...argv], {
      ownerPool: () => {
        ownerPoolsOpened += 1;
        // A fresh pool on the test database's OWNER login: the CLI ends it.
        return new pg.Pool({ connectionString: admin.options.connectionString, max: 2 });
      },
      readonlyPool: NO_POOL,
      writerPool: NO_POOL,
      sourceDiscoveryPool: NO_POOL,
      out: (t) => void (out += t),
      err: () => undefined,
    });
    return { exit, body: JSON.parse(out) as Record<string, unknown> };
  }

  async function rowsFor(briefKey: string, digest: string) {
    const { rows } = await admin.query<{ id: string; query_plan: unknown }>(
      `SELECT id, query_plan FROM source_discovery_briefs
        WHERE brief_key = $1 AND plan_digest = $2`,
      [briefKey, digest],
    );
    return rows;
  }

  it('the dry run registers nothing and opens no pool', async () => {
    const plan = planDiscoveryQueries({ geography: 'KE' });
    const before = await rowsFor(DISCOVERY_PLAN_VERSION, plan.digest);
    const opened = ownerPoolsOpened;
    const r = await cli(['--brief', DISCOVERY_PLAN_VERSION, '--geography', 'KE', '--json']);
    expect(r.exit).toBe(0);
    expect(r.body).toMatchObject({ outcome: 'DRY_RUN', data: { planDigest: plan.digest } });
    expect(ownerPoolsOpened).toBe(opened);
    expect(await rowsFor(DISCOVERY_PLAN_VERSION, plan.digest)).toEqual(before);
  });

  it('registers a v2 plan once, returns the same brief id on re-run, and a grant can name it', async () => {
    const plan = planDiscoveryQueries({ geography: 'JP' });
    const first = await cli(['--brief', DISCOVERY_PLAN_VERSION, '--geography', 'JP', '--json']);
    const again = await cli([
      '--brief',
      DISCOVERY_PLAN_VERSION,
      '--geography',
      'JP',
      '--execute',
      '--json',
    ]);
    const third = await cli([
      '--brief',
      DISCOVERY_PLAN_VERSION,
      '--geography',
      'JP',
      '--execute',
      '--json',
    ]);
    expect(first.body['outcome']).toBe('DRY_RUN');
    expect(again.exit).toBe(0);
    expect(again.body).toMatchObject({
      outcome: 'REGISTERED',
      data: { planKind: 'PLAN_V2', geography: 'JP', planDigest: plan.digest },
    });
    const briefId = (again.body['data'] as { briefId: string }).briefId;
    expect((third.body['data'] as { briefId: string }).briefId).toBe(briefId);

    const rows = await rowsFor(DISCOVERY_PLAN_VERSION, plan.digest);
    expect(rows.map((r) => r.id)).toEqual([briefId]);
    // The stored body is exactly what a granted run re-derives and accepts.
    expect(rederiveStoredPlan(rows[0]!.query_plan, plan.digest)?.digest).toBe(plan.digest);

    // The OWNER grant row the ADR 0028 s6 step writes now has its target.
    const grant = await admin.query<{ id: string }>(
      `INSERT INTO source_discovery_grants
         (brief_id, plan_digest, geography, provider_key, model_id, max_queries,
          max_results_per_query, max_runs, issued_at, expires_at, actor_key)
       VALUES ($1, $2, 'JP', 'claude-max-web-search', $3, 1, 20, 1,
               now(), now() + interval '24 hours', 'owner-cli')
       RETURNING id`,
      [briefId, plan.digest, SOURCE_DISCOVERY_ALLOWED_MODELS[0]!],
    );
    expect(grant.rows).toHaveLength(1);
  });

  it('registers a known v1 brief by its own digest, idempotently', async () => {
    const digest = briefDigest(NWF_DISCOVERY_BRIEF_V1);
    const args = ['--brief', NWF_DISCOVERY_BRIEF_V1.briefKey, '--geography', 'NL', '--execute'];
    const a = await cli([...args, '--json']);
    const b = await cli([...args, '--json']);
    expect(a.body).toMatchObject({
      outcome: 'REGISTERED',
      data: { planKind: 'BRIEF_V1', planDigest: digest },
    });
    const briefId = (a.body['data'] as { briefId: string }).briefId;
    expect((b.body['data'] as { briefId: string }).briefId).toBe(briefId);
    expect((await rowsFor(NWF_DISCOVERY_BRIEF_V1.briefKey, digest)).map((r) => r.id)).toEqual([
      briefId,
    ]);
  });

  it('a refused plan registers nothing and opens no pool', async () => {
    const opened = ownerPoolsOpened;
    const r = await cli([
      '--brief',
      DISCOVERY_PLAN_VERSION,
      '--geography',
      'ZZ',
      '--execute',
      '--json',
    ]);
    expect(r.exit).toBe(1);
    expect(r.body).toMatchObject({ outcome: 'REFUSED', code: 'PLAN_GEOGRAPHY_UNKNOWN' });
    expect(ownerPoolsOpened).toBe(opened);
  });
});

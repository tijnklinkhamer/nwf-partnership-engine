/**
 * WW R2 E-1 - `orgunits source-discovery plan register`: the DRY RUN and every
 * refusal open NO database connection. The OWNER-path pool factory is
 * injected as one that throws, so any attempt to connect fails the test.
 * The --execute path is proven against a disposable database in
 * src/test/integration/sourceDiscoveryPlanRegisterCli.test.ts.
 */
import { describe, expect, it } from 'vitest';

import { runSourceDiscoveryCli } from '../../cli/commands/sourceDiscovery.js';
import { NWF_DISCOVERY_BRIEF_V1, briefDigest } from '../../orgunits/sourceDiscovery/brief.js';
import { planDiscoveryQueries } from '../../orgunits/sourceDiscovery/planner/plan.js';
import { DISCOVERY_PLAN_VERSION } from '../../orgunits/sourceDiscovery/planner/vocabulary.js';

const NO_POOL = () => {
  throw new Error('a dry run or a refusal must open no database connection');
};

async function cli(argv: readonly string[]) {
  let out = '';
  let err = '';
  const exit = await runSourceDiscoveryCli(argv, {
    ownerPool: NO_POOL,
    readonlyPool: NO_POOL,
    writerPool: NO_POOL,
    sourceDiscoveryPool: NO_POOL,
    out: (t) => void (out += t),
    err: (t) => void (err += t),
  });
  return { exit, out, err };
}

const REGISTER = ['source-discovery', 'plan', 'register'] as const;

describe('orgunits source-discovery plan register (dry run, no database)', () => {
  it('prints the v2 plan digest it would register, and registers nothing', async () => {
    const plan = planDiscoveryQueries({ geography: 'JP' });
    const r = await cli([
      ...REGISTER,
      '--brief',
      DISCOVERY_PLAN_VERSION,
      '--geography',
      'JP',
      '--json',
    ]);
    expect(r.exit).toBe(0);
    const body = JSON.parse(r.out) as Record<string, unknown>;
    expect(body).toMatchObject({
      contract: 'nwf-pe.source-discovery.v1',
      command: 'source-discovery plan register',
      outcome: 'DRY_RUN',
      data: {
        briefKey: DISCOVERY_PLAN_VERSION,
        planKind: 'PLAN_V2',
        geography: 'JP',
        planDigest: plan.digest,
        briefId: null,
      },
    });
    expect((body['data'] as { queries: unknown[] }).queries).toHaveLength(plan.queries.length);
  });

  it('prints a known v1 brief digest for a geography it claims', async () => {
    const r = await cli([
      ...REGISTER,
      '--brief',
      NWF_DISCOVERY_BRIEF_V1.briefKey,
      '--geography',
      'MX',
    ]);
    expect(r.exit).toBe(0);
    expect(r.out).toContain(`planDigest ${briefDigest(NWF_DISCOVERY_BRIEF_V1)}\n`);
    expect(r.out).toContain('DRY RUN: nothing was registered');
  });

  it('is deterministic: the same brief and geography print the same digest', async () => {
    const a = await cli([...REGISTER, '--brief', DISCOVERY_PLAN_VERSION, '--geography', 'BR']);
    const b = await cli([...REGISTER, '--brief', DISCOVERY_PLAN_VERSION, '--geography', 'BR']);
    expect(a.out).toBe(b.out);
  });

  it.each([
    [['--brief', 'nwf-discovery-brief-v9', '--geography', 'JP'], 'BRIEF_UNKNOWN'],
    [['--brief', NWF_DISCOVERY_BRIEF_V1.briefKey, '--geography', 'FR'], 'GEOGRAPHY_NOT_CLAIMED'],
    [['--brief', DISCOVERY_PLAN_VERSION, '--geography', 'ZZ'], 'PLAN_GEOGRAPHY_UNKNOWN'],
    [['--brief', DISCOVERY_PLAN_VERSION, '--geography', 'jp'], 'PLAN_GEOGRAPHY_UNKNOWN'],
    [['--brief', DISCOVERY_PLAN_VERSION], 'INPUT_INVALID'],
    [['--geography', 'JP'], 'INPUT_INVALID'],
    [['--brief', DISCOVERY_PLAN_VERSION, '--geography', 'JP', '--grant-id', 'x'], 'INPUT_INVALID'],
    [['--brief', DISCOVERY_PLAN_VERSION, '--geography', 'JP', 'extra'], 'INPUT_INVALID'],
  ])('refuses %j with %s, even with --execute, and opens no database', async (args, code) => {
    for (const extra of [[], ['--execute']]) {
      const r = await cli([...REGISTER, ...args, ...extra, '--json']);
      expect(r.exit).toBe(1);
      expect(JSON.parse(r.out)).toMatchObject({ outcome: 'REFUSED', code });
      expect(r.err).toContain(`REFUSED ${code}`);
    }
  });

  it('an unknown source-discovery subcommand prints usage and fails', async () => {
    for (const argv of [
      ['source-discovery'],
      ['source-discovery', 'plan'],
      ['source-discovery', 'plan', 'grant'],
      ['source-discovery', 'grant', 'register'],
    ]) {
      const r = await cli(argv);
      expect(r.exit, argv.join(' ')).toBe(1);
      expect(r.out).toContain('orgunits source-discovery plan register');
    }
  });
});

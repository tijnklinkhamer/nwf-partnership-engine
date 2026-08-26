/**
 * PHASE 2B-1E SAFETY-GAP CORRECTION: a RUNTIME test of `nwf-pe orgunits
 * discover`, through the REAL CLI argument-parsing/routing path
 * (`src/cli/index.ts`'s exported `main`), not merely a call to
 * `runOrgunitsDiscover` (the handler the CLI happens to use).
 *
 * The prior 2B-1E implementation verified the dry-run/--all/missing-scope
 * contract only by code review and the firewall's static-source checks
 * (`phase2b.firewall.test.ts`'s "the CLI is an entry point" block). That is
 * necessary but not sufficient for the first production network-capable
 * research entry point in this repository: a static check cannot prove that
 * INVOKING the command with realistic arguments actually performs zero
 * network activity and zero writes.
 *
 * `main` is exported from `src/cli/index.ts` specifically for this test (a
 * narrow testability refactor, the SAME already-established pattern
 * `src/db/migrate.ts` uses: the auto-invoke at the bottom of the file is
 * guarded so importing the module never runs it with the test runner's own
 * `process.argv`). No behaviour change - `main` does exactly what it did
 * before, and CLI execution (`npm run cli`) still calls it identically.
 *
 * NO LIVE NETWORK: only the DRY-RUN path (no `--execute`) and REJECTED
 * invocations (`--all`, missing `--organisation-id`) are exercised here -
 * both are, by construction, network-free. `--execute` is never passed in
 * this file, because that path calls the real, uninjectable
 * `runOrganisationDiscovery` with the production transport - exercising it
 * here would be a live institution request, which this correction pass is
 * explicitly forbidden from making.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  count,
  researchDatabaseConfigured,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';

// MUST run before ANYTHING else in this file touches `../../config/env.js`'s
// `env()` - including the `researchDatabaseConfigured()` call two lines
// below. `env()` snapshots `process.env` into a module-level cache on its
// FIRST call, ever, for this process/module-instance, and every later call
// returns that same snapshot - a `process.env` mutation from inside a
// `beforeAll` hook is too late, because merely EVALUATING this file's
// `describeIf` gate below already forces the first call. This is genuine
// top-level module code (not inside a function), so it runs before the
// `describeIf` line, in source order, exactly as ESM requires.
//
// Points the CLI's PRODUCTION connection variable (`DATABASE_URL_RESEARCH`,
// what `withPool('research', ...)` in discover.ts actually reads) at the
// TEST database's research role for the remainder of this process - the
// same mechanism `npm run cli` itself uses, just aimed at nwf_pe_test rather
// than nwf_pe. Read RAW off `process.env` rather than through
// `testDatabaseUrl()`, specifically so this assignment itself is not what
// triggers the snapshot.
const PREVIOUS_DATABASE_URL_RESEARCH = process.env.DATABASE_URL_RESEARCH;
if (process.env.DATABASE_URL_RESEARCH_TEST) {
  process.env.DATABASE_URL_RESEARCH = process.env.DATABASE_URL_RESEARCH_TEST;
}

const configured = researchDatabaseConfigured();
const describeIf = configured ? describe : describe.skip;

/** Every table a REAL research run (or its evidence) could ever write to. */
const RESEARCH_WRITE_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_redirect_observations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
];

async function snapshotCounts(pool: pg.Pool): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of RESEARCH_WRITE_TABLES) result[table] = await count(pool, table);
  return result;
}

describeIf('nwf-pe orgunits discover - CLI runtime safety gaps (2B-1E correction)', () => {
  let admin: pg.Pool;
  let fixture: OrgunitRootFixture;
  let main: (argv: string[]) => Promise<number>;

  beforeAll(async () => {
    // The DATABASE_URL_RESEARCH override already happened at module top
    // level, above - before `researchDatabaseConfigured()` could snapshot
    // env.ts's cache. Nothing further to do here except open the pools.
    admin = adminPool();
    ({ main } = await import('../../cli/index.js'));
  });

  afterAll(async () => {
    if (PREVIOUS_DATABASE_URL_RESEARCH === undefined) delete process.env.DATABASE_URL_RESEARCH;
    else process.env.DATABASE_URL_RESEARCH = PREVIOUS_DATABASE_URL_RESEARCH;
    await admin?.end();
  });

  beforeEach(async () => {
    await truncateAll(admin);
    fixture = await seedOrgunitRoot(admin);
  });

  afterEach(async () => {
    await truncateAll(admin);
  });

  it('dry run (no --execute): zero rows in every research-run/evidence table, exit code 0', async () => {
    const before = await snapshotCounts(admin);
    // Sanity: the fixture leaves everything at zero before the CLI runs at all.
    for (const table of RESEARCH_WRITE_TABLES) expect(before[table], table).toBe(0);

    const exitCode = await main([
      'orgunits',
      'discover',
      '--organisation-id',
      fixture.organisationId,
    ]);

    expect(exitCode).toBe(0);

    const after = await snapshotCounts(admin);
    expect(after).toEqual(before);
    for (const table of RESEARCH_WRITE_TABLES) {
      expect(after[table], `${table} should still be zero after a dry run`).toBe(0);
    }
  });

  it('dry run --json: the reported plan is DRY_RUN, names no fetch/DNS activity, and still writes nothing', async () => {
    const originalWrite = process.stdout.write.bind(process.stdout);
    let captured = '';
    process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
      captured += typeof chunk === 'string' ? chunk : String(chunk);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalWrite as any)(chunk, ...rest);
    }) as typeof process.stdout.write;

    let exitCode: number;
    try {
      exitCode = await main([
        'orgunits',
        'discover',
        '--organisation-id',
        fixture.organisationId,
        '--json',
      ]);
    } finally {
      process.stdout.write = originalWrite;
    }

    expect(exitCode).toBe(0);
    const plan = JSON.parse(captured) as { mode: string; note: string };
    expect(plan.mode).toBe('DRY_RUN');
    expect(plan.note).toContain('No DNS lookup and no HTTP request were made');

    const after = await snapshotCounts(admin);
    for (const table of RESEARCH_WRITE_TABLES) expect(after[table], table).toBe(0);
  });

  it('an unknown --all-shaped flag is rejected by the REAL argument parser before any command runs (no bulk crawl path)', async () => {
    const before = await snapshotCounts(admin);
    // node:util parseArgs({ strict: true }) throws for an undeclared option -
    // there is no `--all` in index.ts's options map (the firewall pins this
    // statically; this proves it at runtime too).
    await expect(main(['orgunits', 'discover', '--all'])).rejects.toThrow();
    const after = await snapshotCounts(admin);
    expect(after).toEqual(before);
  });

  it('an unknown execution-like typo flag (--exec instead of --execute) is rejected, never silently treated as --execute', async () => {
    const before = await snapshotCounts(admin);
    await expect(
      main(['orgunits', 'discover', '--organisation-id', fixture.organisationId, '--exec']),
    ).rejects.toThrow();
    const after = await snapshotCounts(admin);
    expect(after).toEqual(before);
  });

  it('missing --organisation-id is rejected before any database read or network activity, exit code 1', async () => {
    const before = await snapshotCounts(admin);
    const exitCode = await main(['orgunits', 'discover']);
    expect(exitCode).toBe(1);
    const after = await snapshotCounts(admin);
    expect(after).toEqual(before);
  });

  it('an --organisation-id naming no organisation is rejected, not silently treated as "discover everything"', async () => {
    const before = await snapshotCounts(admin);
    const exitCode = await main([
      'orgunits',
      'discover',
      '--organisation-id',
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(exitCode).toBe(1);
    const after = await snapshotCounts(admin);
    expect(after).toEqual(before);
  });
});

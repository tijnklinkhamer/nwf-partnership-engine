/**
 * WW E-SD - a live source-discovery run is possible ONLY under a stored
 * OWNER-path grant (ADR 0027 D1-D8, ADR 0028), proven end to end against a
 * DISPOSABLE PostgreSQL with a FAKE Agent SDK.
 *
 * Nothing here reaches a network or a model: the SDK `query`, the
 * request-free auth-status runner and the Claude Code executable are all
 * injected fakes, and every nominated domain is fictitious (`-fict`).
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { testDatabaseUrl } from '../../config/env.js';
import { runSourceDiscoveryCli } from '../../cli/commands/sourceDiscovery.js';
import type { SdkQueryFn, SdkStreamMessage } from '../../orgunits/sourceDiscovery/agentQuery.js';
import { SourceDiscoveryAuthorisation } from '../../orgunits/sourceDiscovery/authorisation.js';
import {
  NWF_DISCOVERY_BRIEF_V1,
  briefDigest,
  queriesFor,
} from '../../orgunits/sourceDiscovery/brief.js';
import { ClaudeMaxWebSearchProvider } from '../../orgunits/sourceDiscovery/claudeMaxWebSearchProvider.js';
import {
  GrantedRunRefusal,
  runGrantedSourceDiscovery,
  type GrantedRunDeps,
} from '../../orgunits/sourceDiscovery/grantedRun.js';
import { SOURCE_DISCOVERY_ALLOWED_MODELS } from '../../orgunits/sourceDiscovery/grant.js';
import { registerPlan } from '../../orgunits/sourceDiscovery/grantStore.js';
import { planBody, planDiscoveryQueries } from '../../orgunits/sourceDiscovery/planner/plan.js';
import {
  inSourceDiscoveryTransaction,
  registerBrief,
} from '../../orgunits/sourceDiscovery/store.js';
import { adminPool, readonlyPool, researchDatabaseConfigured } from './helpers.js';

const describeDb = researchDatabaseConfigured() ? describe : describe.skip;

const SUFFIX = randomBytes(4).toString('hex');
const SOURCE_LOGIN = `nwf_ww_esd_source_${SUFFIX}`;
const LOGIN_PASSWORD = randomBytes(24).toString('hex');
/** A model from the closed allowlist, named through the constant (phase1a: no model-id literals). */
const MODEL = SOURCE_DISCOVERY_ALLOWED_MODELS[2]!;
const SDK_VERSION = '0.3.251';
const HOUR = 3_600_000;

function urlFor(login: string): string {
  const url = new URL(testDatabaseUrl('admin')!);
  url.username = login;
  url.password = LOGIN_PASSWORD;
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

async function refusalOf(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof GrantedRunRefusal) return err.code;
    throw err;
  }
  return 'SUCCEEDED';
}

// ---------------------------------------------------------------- the fake SDK

type Behaviour =
  | { readonly kind: 'results'; readonly urls: readonly (readonly [string, string])[] }
  | { readonly kind: 'invalid-output' }
  | { readonly kind: 'usage-limit' }
  | { readonly kind: 'auth-failure' }
  | { readonly kind: 'webfetch' }
  | { readonly kind: 'no-result' };

interface FakeSdk {
  readonly query: SdkQueryFn;
  readonly prompts: string[];
  readonly options: Parameters<SdkQueryFn>[0]['options'][];
}

/** A scripted SDK: the n-th call behaves as `script(n)`. Never a network call. */
function fakeSdk(script: (call: number, prompt: string) => Behaviour): FakeSdk {
  const prompts: string[] = [];
  const options: Parameters<SdkQueryFn>[0]['options'][] = [];
  const query: SdkQueryFn = (args) => {
    const call = prompts.length;
    prompts.push(args.prompt);
    options.push(args.options);
    const behaviour = script(call, args.prompt);
    return (async function* (): AsyncGenerator<SdkStreamMessage> {
      yield { type: 'system', subtype: 'init' };
      switch (behaviour.kind) {
        case 'results':
          yield {
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: 'prose that must never be stored',
            structured_output: {
              results: behaviour.urls.map(([url, title]) => ({
                url,
                title,
                snippet: `${title} - community page`,
              })),
            },
          };
          return;
        case 'invalid-output':
          yield {
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: 'Here are some results: https://prose-fict.jp/',
            structured_output: { results: 'not an array' },
          };
          return;
        case 'usage-limit':
          yield {
            type: 'result',
            subtype: 'success',
            is_error: true,
            result: "You've hit your limit · resets 5pm",
          };
          return;
        case 'auth-failure':
          yield {
            type: 'result',
            subtype: 'success',
            is_error: true,
            result: 'Failed to authenticate. API Error: 401 authentication_error',
          };
          return;
        case 'webfetch': {
          const decision = await args.options.canUseTool!(
            'WebFetch',
            { url: 'https://www.fetch-me-fict.jp/' },
            { signal: new AbortController().signal, toolUseID: 't1' } as never,
          );
          expect(decision?.behavior).toBe('deny');
          yield {
            type: 'result',
            subtype: 'success',
            is_error: false,
            structured_output: {
              results: [{ url: 'https://www.fetch-me-fict.jp/', title: 'x', snippet: null }],
            },
          };
          return;
        }
        case 'no-result':
          return;
      }
    })();
  };
  return { query, prompts, options };
}

const ok = (n: number): Behaviour => ({
  kind: 'results',
  urls: [
    [`https://www.q${n}-gogaku-fict.jp/`, `語学交流サークル ${n}`],
    [`https://q${n}-gogaku-fict.jp/events`, 'Events (same domain, deduped)'],
    ['https://www.fict-u.ac.jp/', '架空大学 国際交流センター'],
    ['https://www.facebook.com/groups/fict', 'Social group (refused)'],
  ],
});

// ---------------------------------------------------------------- suite

describeDb('WW E-SD granted live source discovery (fake SDK, disposable database)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let source: pg.Pool;
  let profileDir: string;
  let homeDir: string;
  let v1BriefId: string;

  function deps(sdk: FakeSdk, overrides: Partial<GrantedRunDeps> = {}): GrantedRunDeps {
    return {
      sdkQuery: sdk.query,
      authStatusRunner: {
        run: () =>
          Promise.resolve({
            exitCode: 0,
            stdout: JSON.stringify({
              loggedIn: true,
              authMethod: 'claude.ai',
              apiProvider: 'firstParty',
              subscriptionType: 'max',
            }),
          }),
      },
      env: () => ({ HOME: homeDir, NWF_PE_CLASSIFIER_CONFIG_DIR: profileDir, PATH: '/usr/bin' }),
      repoRoot: process.cwd(),
      claudeCodeExecutable: () => ({
        ok: true,
        provenance: {
          executablePath: '/opt/fake-claude/claude',
          packageRoot: '/opt/fake-claude',
          sdkPackageName: '@fake/sdk',
          sdkVersion: SDK_VERSION,
          claudeCodeVersion: '2.1.251',
          nativePackageName: '@fake/native',
          nativePackageVersion: SDK_VERSION,
          platformKey: 'darwin-arm64',
          binaryFileName: 'claude',
          binaryBytes: 1,
          binarySha256: 'a'.repeat(64),
        },
      }),
      clock: { now: () => new Date() },
      ...overrides,
    };
  }

  async function grant(input: {
    briefId: string;
    digest: string;
    geography: string;
    maxQueries?: number;
    maxResults?: number;
    maxRuns?: number;
    issuedAt?: Date;
    expiresAt?: Date;
    model?: string;
  }): Promise<string> {
    const issued = input.issuedAt ?? new Date(Date.now() - HOUR);
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO source_discovery_grants
         (brief_id, plan_digest, geography, provider_key, model_id, max_queries,
          max_results_per_query, max_runs, issued_at, expires_at, actor_key)
       VALUES ($1, $2, $3, 'claude-max-web-search', $4, $5, $6, $7, $8, $9, 'owner-cli')
       RETURNING id`,
      [
        input.briefId,
        input.digest,
        input.geography,
        input.model ?? MODEL,
        input.maxQueries ?? 3,
        input.maxResults ?? 20,
        input.maxRuns ?? 1,
        issued.toISOString(),
        (input.expiresAt ?? new Date(issued.getTime() + 24 * HOUR)).toISOString(),
      ],
    );
    return rows[0]!.id;
  }

  async function count(table: string): Promise<number> {
    const { rows } = await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0]!.n;
  }

  beforeAll(async () => {
    admin = adminPool();
    readonly = readonlyPool();
    await admin.query(`CREATE ROLE ${SOURCE_LOGIN} LOGIN PASSWORD '${LOGIN_PASSWORD}'`);
    await admin.query(`GRANT nwf_source_discovery TO ${SOURCE_LOGIN}`);
    source = new pg.Pool({ connectionString: urlFor(SOURCE_LOGIN), max: 4 });
    homeDir = await mkdtemp(join(tmpdir(), 'nwf-ww-esd-home-'));
    profileDir = await mkdtemp(join(tmpdir(), 'nwf-ww-esd-profile-'));
  });

  beforeEach(async () => {
    await admin.query(
      `TRUNCATE source_discovery_nomination_known_marks, source_discovery_run_completions,
                source_discovery_query_calls, source_discovery_grant_uses, source_discovery_grants,
                source_discovery_nomination_sightings, source_discovery_nomination_identities,
                source_discovery_nominations, source_discovery_runs, source_discovery_briefs CASCADE`,
    );
    v1BriefId = await inSourceDiscoveryTransaction(source, (c) =>
      registerBrief(c, NWF_DISCOVERY_BRIEF_V1),
    );
  });

  afterAll(async () => {
    await source?.end();
    await readonly?.end();
    await admin.query(`DROP ROLE IF EXISTS ${SOURCE_LOGIN}`).catch(() => undefined);
    await admin?.end();
    await rm(homeDir, { recursive: true, force: true });
    await rm(profileDir, { recursive: true, force: true });
  });

  // ------------------------------------------------------------ the happy path

  it('a valid grant runs its queries, records grant use, calls, nominations and completion', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
    });
    const sdk = fakeSdk((n) => ok(n));
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'source-discovery-cli' },
      deps(sdk),
    );
    expect(result.outcome).toBe('COMPLETED');
    expect(result.reason).toBeNull();
    expect(result.runSeq).toBe(1);
    expect(result.sdkVersion).toBe(SDK_VERSION);
    const section = queriesFor(NWF_DISCOVERY_BRIEF_V1, 'JP').queries.slice(0, 3);
    expect(result.calls.map((c) => [c.queryId, c.outcome, c.smoke])).toEqual(
      section.map((q, i) => [q.queryId, 'RESULTS', i === 0]),
    );
    // One prompt per query, carrying exactly the plan's text.
    expect(sdk.prompts).toHaveLength(3);
    section.forEach((q, i) => expect(sdk.prompts[i]).toContain(JSON.stringify(q.text)));
    // WebSearch-only options, the granted model, the verified executable, a scratch cwd.
    for (const o of sdk.options) {
      expect(o.tools).toEqual(['WebSearch']);
      expect(o.allowedTools).toEqual(['WebSearch']);
      expect(o.disallowedTools).toContain('WebFetch');
      expect(o.model).toBe(MODEL);
      expect(o.pathToClaudeCodeExecutable).toBe('/opt/fake-claude/claude');
      expect(o.cwd).toContain('nwf-pe-source-discovery-');
      expect(o.env!['CLAUDE_CONFIG_DIR']).toBe(profileDir);
      expect(o.mcpServers).toEqual({});
      expect(o.persistSession).toBe(false);
      expect(o.settingSources).toEqual([]);
    }
    // The university is TAGGED and kept; the social URL refused; the same domain deduped.
    expect(result.inserted).toBe(4); // q0, q1, q2 domains + the university once
    const university = result.nominations.find((n) => n.registrableDomain === 'fict-u.ac.jp')!;
    expect(university.heiSignal).toBe(true);
    expect(university.heiSignalReasons).toContain('ACADEMIC_HOST');
    expect(result.refusals).toEqual({ SOCIAL_OR_MESSAGING_HOST: 3 });
    expect(result.nominations.every((n) => n.alreadyKnown === false)).toBe(true);

    const use = await admin.query(
      `SELECT grant_id, run_id, run_seq, actor_key FROM source_discovery_grant_uses`,
    );
    expect(use.rows).toEqual([
      { grant_id: grantId, run_id: result.runId, run_seq: 1, actor_key: 'source-discovery-cli' },
    ]);
    const calls = await admin.query(
      `SELECT call_seq, query_id, outcome, result_count, model_id, sdk_version, smoke
         FROM source_discovery_query_calls ORDER BY call_seq`,
    );
    expect(calls.rows).toEqual(
      section.map((q, i) => ({
        call_seq: i + 1,
        query_id: q.queryId,
        outcome: 'RESULTS',
        result_count: 4,
        model_id: MODEL,
        sdk_version: SDK_VERSION,
        smoke: i === 0,
      })),
    );
    const completion = await admin.query(
      `SELECT outcome, reason, queries_attempted, nominations_inserted, nominations_duplicated,
              nominations_refused, nominations_known FROM source_discovery_run_completions`,
    );
    expect(completion.rows).toEqual([
      {
        outcome: 'COMPLETED',
        reason: null,
        queries_attempted: 3,
        nominations_inserted: 4,
        nominations_duplicated: 5,
        nominations_refused: 3,
        nominations_known: 0,
      },
    ]);
    // No prompt, response or transcript text is stored anywhere.
    const textColumns = await admin.query<{ c: string }>(
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
        WHERE table_name IN ('source_discovery_query_calls', 'source_discovery_run_completions',
                             'source_discovery_grant_uses', 'source_discovery_grants')
          AND data_type IN ('text', 'jsonb', 'json', 'character varying') ORDER BY 1`,
    );
    expect(textColumns.rows.map((r) => r.c)).toEqual([
      'source_discovery_grant_uses.actor_key',
      'source_discovery_grants.actor_key',
      'source_discovery_grants.geography',
      'source_discovery_grants.model_id',
      'source_discovery_grants.plan_digest',
      'source_discovery_grants.provider_key',
      'source_discovery_query_calls.model_id',
      'source_discovery_query_calls.outcome',
      'source_discovery_query_calls.query_id',
      'source_discovery_query_calls.sdk_version',
      'source_discovery_run_completions.outcome',
      'source_discovery_run_completions.reason',
    ]);
    const prose = await admin.query(
      `SELECT count(*)::int AS n FROM source_discovery_nominations
        WHERE title LIKE '%prose%' OR snippet LIKE '%prose%'`,
    );
    expect(prose.rows[0].n).toBe(0);

    // The grant is single-use (max_runs = 1): a second run is refused and leaves no row.
    const runsBefore = await count('source_discovery_runs');
    expect(
      await refusalOf(() =>
        runGrantedSourceDiscovery(source, { grantId, actorKey: 'source-discovery-cli' }, deps(sdk)),
      ),
    ).toBe('GRANT_EXHAUSTED');
    expect(await count('source_discovery_runs')).toBe(runsBefore);
    expect(sdk.prompts).toHaveLength(3);
  });

  it('max_runs > 1 allows exactly that many runs, each one grant-use slot; smoke only once', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'MX',
      maxQueries: 2,
      maxRuns: 2,
    });
    const sdk = fakeSdk((n) => ok(n % 2));
    const first = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    const second = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    expect([first.runSeq, second.runSeq]).toEqual([1, 2]);
    expect(first.calls.map((c) => c.smoke)).toEqual([true, false]);
    expect(second.calls.map((c) => c.smoke)).toEqual([false, false]);
    // The second run re-nominates the same domains: new rows, flagged previously nominated.
    expect(second.nominations.every((n) => n.previouslyNominated)).toBe(true);
    expect(
      await refusalOf(() =>
        runGrantedSourceDiscovery(source, { grantId, actorKey: 'ww-worker' }, deps(sdk)),
      ),
    ).toBe('GRANT_EXHAUSTED');
  });

  it('a v2 plan grant marks already-known domains and never drops them', async () => {
    const plan = planDiscoveryQueries({
      geography: 'NL',
      pageSize: 4,
      excludedDomains: ['q1-gogaku-fict.jp'],
    });
    const briefId = await inSourceDiscoveryTransaction(source, (c) => registerPlan(c, plan));
    const grantId = await grant({ briefId, digest: plan.digest, geography: 'NL', maxQueries: 2 });
    const sdk = fakeSdk((n) => ok(n));
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    expect(result.outcome).toBe('COMPLETED');
    expect(result.planKind).toBe('PLAN_V2');
    expect(result.calls.map((c) => c.queryId)).toEqual(
      plan.queries.slice(0, 2).map((q) => q.queryId),
    );
    sdk.prompts.forEach((p, i) => expect(p).toContain(JSON.stringify(plan.queries[i]!.text)));
    const known = result.nominations.filter((n) => n.alreadyKnown).map((n) => n.registrableDomain);
    expect(known).toEqual(['q1-gogaku-fict.jp']);
    expect(result.alreadyKnown).toBe(1);
    const marks = await admin.query(
      `SELECT n.registrable_domain AS d, m.already_known AS k
         FROM source_discovery_nomination_known_marks m
         JOIN source_discovery_nominations n ON n.id = m.nomination_id ORDER BY 1`,
    );
    expect(marks.rows).toEqual([
      { d: 'fict-u.ac.jp', k: false },
      { d: 'q0-gogaku-fict.jp', k: false },
      { d: 'q1-gogaku-fict.jp', k: true },
    ]);
    // The database re-derives the mark: a lying mark is refused.
    const nomination = result.nominations.find((n) => n.registrableDomain === 'fict-u.ac.jp')!;
    const client = await source.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nwf_source_discovery');
      const mark = (known: boolean) =>
        sqlstate(() =>
          client.query(`INSERT INTO source_discovery_nomination_known_marks VALUES ($1, $2)`, [
            nomination.nominationId,
            known,
          ]),
        );
      await client.query('SAVEPOINT s');
      expect(await mark(true)).toBe('23514'); // a lie about the measurement
      await client.query('ROLLBACK TO SAVEPOINT s');
      expect(await mark(false)).toBe('23505'); // the truth, but already recorded
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const completion = await admin.query(
      `SELECT nominations_known FROM source_discovery_run_completions`,
    );
    expect(completion.rows).toEqual([{ nominations_known: 1 }]);
  });

  // ------------------------------------------------------------ refusals before any row

  it('refuses an expired, not-yet-valid, unknown or malformed grant with no run row', async () => {
    const digest = briefDigest(NWF_DISCOVERY_BRIEF_V1);
    const expired = await grant({
      briefId: v1BriefId,
      digest,
      geography: 'JP',
      issuedAt: new Date(Date.now() - 72 * HOUR),
      expiresAt: new Date(Date.now() - 48 * HOUR),
    });
    const future = await grant({
      briefId: v1BriefId,
      digest,
      geography: 'JP',
      issuedAt: new Date(Date.now() + 24 * HOUR),
    });
    const sdk = fakeSdk((n) => ok(n));
    const run = (grantId: string) =>
      refusalOf(() =>
        runGrantedSourceDiscovery(source, { grantId, actorKey: 'ww-worker' }, deps(sdk)),
      );
    expect(await run(expired)).toBe('GRANT_EXPIRED');
    expect(await run(future)).toBe('GRANT_NOT_YET_VALID');
    expect(await run('00000000-0000-4000-8000-000000000000')).toBe('GRANT_NOT_FOUND');
    expect(await run('not-a-uuid')).toBe('GRANT_ID_INVALID');
    expect(
      await refusalOf(() =>
        runGrantedSourceDiscovery(source, { grantId: expired, actorKey: 'Tijn K' }, deps(sdk)),
      ),
    ).toBe('ACTOR_KEY_INVALID');
    expect(await count('source_discovery_runs')).toBe(0);
    expect(await count('source_discovery_grant_uses')).toBe(0);
    expect(sdk.prompts).toEqual([]);
  });

  it('a failed ADR 0010 pre-flight refuses without spending the grant', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
    });
    const sdk = fakeSdk((n) => ok(n));
    let caught: unknown;
    try {
      await runGrantedSourceDiscovery(
        source,
        { grantId, actorKey: 'ww-worker' },
        deps(sdk, {
          env: () => ({
            HOME: homeDir,
            NWF_PE_CLASSIFIER_CONFIG_DIR: profileDir,
            CLAUDE_CODE_USE_BEDROCK: '1',
          }),
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(GrantedRunRefusal);
    expect((caught as GrantedRunRefusal).code).toBe('LIVE_SEARCH_PREFLIGHT_REFUSED');
    expect((caught as GrantedRunRefusal).preflightKind).toBe('CONFLICTING_AUTH_VARIABLES');
    const notMax = await refusalOf(() =>
      runGrantedSourceDiscovery(
        source,
        { grantId, actorKey: 'ww-worker' },
        deps(sdk, {
          authStatusRunner: {
            run: () =>
              Promise.resolve({
                exitCode: 0,
                stdout: JSON.stringify({
                  loggedIn: true,
                  authMethod: 'claude.ai',
                  apiProvider: 'firstParty',
                  subscriptionType: 'pro',
                }),
              }),
          },
        }),
      ),
    );
    expect(notMax).toBe('LIVE_SEARCH_PREFLIGHT_REFUSED');
    expect(await count('source_discovery_grant_uses')).toBe(0);
    expect(sdk.prompts).toEqual([]);
    // The grant is still spendable.
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    expect(result.outcome).toBe('COMPLETED');
  });

  it('refuses a grant whose plan this build does not reproduce (wrong digest, tampered v2 plan)', async () => {
    const sdk = fakeSdk((n) => ok(n));
    // A row claiming to be the v1 brief, with a plan and digest this build does not hold.
    const forged = { ...JSON.parse(JSON.stringify(NWF_DISCOVERY_BRIEF_V1)) };
    const forgedDigest = 'e'.repeat(64);
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO source_discovery_briefs
         (brief_key, plan_digest, query_plan, geography_claim, target_kinds, languages)
       VALUES ('nwf-discovery-brief-v1', $1, $2, '{JP,MX,NL}', '{LANGUAGE_CAFE}', '{en,ja}')
       RETURNING id`,
      [
        forgedDigest,
        JSON.stringify({ ...forged, sections: [{ geography: 'JP', queries: [1, 2, 3] }] }),
      ],
    );
    const wrongDigest = await grant({
      briefId: rows[0]!.id,
      digest: forgedDigest,
      geography: 'JP',
    });
    expect(
      await refusalOf(() =>
        runGrantedSourceDiscovery(
          source,
          { grantId: wrongDigest, actorKey: 'ww-worker' },
          deps(sdk),
        ),
      ),
    ).toBe('GRANT_PLAN_MISMATCH');

    // A v2 plan whose stored query text was edited: same request, different body.
    const plan = planDiscoveryQueries({ geography: 'JP', pageSize: 3 });
    const tampered = JSON.parse(JSON.stringify(planBody(plan))) as { queries: { text: string }[] };
    tampered.queries[0]!.text = 'injected query text';
    const tamperedDigest = 'd'.repeat(64);
    const t = await admin.query<{ id: string }>(
      `INSERT INTO source_discovery_briefs
         (brief_key, plan_digest, query_plan, geography_claim, target_kinds, languages)
       VALUES ('nwf-discovery-plan-v2', $1, $2, '{JP}', '{LANGUAGE_SOCIETY}', '{ja,en}')
       RETURNING id`,
      [tamperedDigest, JSON.stringify(tampered)],
    );
    const tamperedGrant = await grant({
      briefId: t.rows[0]!.id,
      digest: tamperedDigest,
      geography: 'JP',
    });
    expect(
      await refusalOf(() =>
        runGrantedSourceDiscovery(
          source,
          { grantId: tamperedGrant, actorKey: 'ww-worker' },
          deps(sdk),
        ),
      ),
    ).toBe('GRANT_PLAN_MISMATCH');
    expect(await count('source_discovery_runs')).toBe(0);
    expect(sdk.prompts).toEqual([]);
  });

  it('a grant cannot name a geography its plan does not claim, nor exceed its queries', async () => {
    const digest = briefDigest(NWF_DISCOVERY_BRIEF_V1);
    expect(await sqlstate(() => grant({ briefId: v1BriefId, digest, geography: 'FR' }))).toBe(
      '23514',
    );
    expect(
      await sqlstate(() => grant({ briefId: v1BriefId, digest, geography: 'NL', maxQueries: 12 })),
    ).toBe('23514');
    const plan = planDiscoveryQueries({ geography: 'JP', pageSize: 3 });
    const briefId = await inSourceDiscoveryTransaction(source, (c) => registerPlan(c, plan));
    expect(await sqlstate(() => grant({ briefId, digest: plan.digest, geography: 'MX' }))).toBe(
      '23514',
    );
    expect(await sqlstate(() => grant({ briefId, digest, geography: 'JP' }))).toBe('23503');
    expect(
      await sqlstate(() =>
        grant({
          briefId,
          digest: plan.digest,
          geography: 'JP',
          model: ['claude', 'unknown', '9'].join('-'),
        }),
      ),
    ).toBe('23514');
    expect(
      await sqlstate(() =>
        grant({
          briefId,
          digest: plan.digest,
          geography: 'JP',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 15 * 24 * HOUR),
        }),
      ),
    ).toBe('23514');
    expect(
      await sqlstate(() => grant({ briefId, digest: plan.digest, geography: 'JP', maxRuns: 201 })),
    ).toBe('23514');

    // A grant-derived authority refuses any request outside its own queries and geography.
    const grantId = await grant({ briefId, digest: plan.digest, geography: 'JP', maxQueries: 2 });
    const authorisation = await SourceDiscoveryAuthorisation.fromStoredGrant(source, grantId, {
      now: () => new Date(),
    });
    const sdk = fakeSdk((n) => ok(n));
    const provider = new ClaudeMaxWebSearchProvider(authorisation, {
      query: () => {
        throw new Error('the SDK must not be reached');
      },
      now: () => new Date(),
    });
    for (const request of [
      { briefKey: plan.planVersion, geography: 'MX', query: plan.queries[0]! },
      { briefKey: plan.planVersion, geography: 'JP', query: plan.queries[2]! },
      {
        briefKey: plan.planVersion,
        geography: 'JP',
        query: { ...plan.queries[0]!, text: 'other' },
      },
      { briefKey: 'nwf-discovery-brief-v1', geography: 'JP', query: plan.queries[0]! },
    ]) {
      await expect(provider.search(request)).rejects.toMatchObject({
        code: 'PROVIDER_NOT_AUTHORISED',
      });
    }
    expect(sdk.prompts).toEqual([]);
  });

  // ------------------------------------------------------------ fail closed

  it.each([
    ['webfetch', 'TOOL_REFUSED', 'FAILED'],
    ['invalid-output', 'PROVIDER_OUTPUT_INVALID', 'FAILED'],
    ['usage-limit', 'USAGE_LIMIT_EXHAUSTED', 'ABORTED'],
    ['auth-failure', 'AUTH_FAILURE', 'FAILED'],
    ['no-result', 'PROVIDER_RESULT_MISSING', 'FAILED'],
  ] as const)(
    'a %s on the second query records %s and ends the run %s',
    async (kind, callOutcome, runOutcome) => {
      const grantId = await grant({
        briefId: v1BriefId,
        digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
        geography: 'NL',
        maxQueries: 4,
      });
      const sdk = fakeSdk((n) => (n === 1 ? { kind } : ok(n)));
      const result = await runGrantedSourceDiscovery(
        source,
        { grantId, actorKey: 'ww-worker' },
        deps(sdk),
      );
      expect(result.outcome).toBe(runOutcome);
      expect(result.reason).toBe(callOutcome);
      // No retry, no fallback: the run stopped at the failing query.
      expect(sdk.prompts).toHaveLength(2);
      expect(result.calls.map((c) => [c.outcome, c.resultCount])).toEqual([
        ['RESULTS', 4],
        [callOutcome, null],
      ]);
      // Nothing from the failing query is stored (no salvage from prose).
      expect(result.nominations.every((n) => n.queryId === result.calls[0]!.queryId)).toBe(true);
      const completion = await admin.query(
        `SELECT outcome, reason, queries_attempted FROM source_discovery_run_completions`,
      );
      expect(completion.rows).toEqual([
        { outcome: runOutcome, reason: callOutcome, queries_attempted: 2 },
      ]);
    },
  );

  it('D8: a structured-output failure on the very first (smoke) call fails the run closed', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
    });
    const sdk = fakeSdk(() => ({ kind: 'invalid-output' }));
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    expect(result.outcome).toBe('FAILED');
    expect(result.calls).toEqual([
      expect.objectContaining({ callSeq: 1, smoke: true, outcome: 'PROVIDER_OUTPUT_INVALID' }),
    ]);
    expect(await count('source_discovery_nominations')).toBe(0);
  });

  it('a grant that expires mid-run ABORTS before the next query', async () => {
    const issued = new Date(Date.now() - HOUR);
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
      issuedAt: issued,
    });
    let calls = 0;
    const clock = {
      now: () => {
        calls += 1;
        // After the first query's start/end readings, jump past the expiry.
        return calls <= 4 ? new Date() : new Date(issued.getTime() + 25 * HOUR);
      },
    };
    const sdk = fakeSdk((n) => ok(n));
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk, { clock }),
    );
    expect(result.outcome).toBe('ABORTED');
    expect(result.reason).toBe('GRANT_EXPIRED');
    expect(sdk.prompts).toHaveLength(1);
  });

  // ------------------------------------------------------------ the database's own refusals

  it('nwf_source_discovery cannot insert, update or delete a grant', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
    });
    const client = await source.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nwf_source_discovery');
      for (const sql of [
        `INSERT INTO source_discovery_grants
           (brief_id, plan_digest, geography, provider_key, model_id, max_queries,
            max_results_per_query, issued_at, expires_at, actor_key)
         SELECT brief_id, plan_digest, geography, provider_key, model_id, 1, 1, now(),
                now() + interval '1 hour', 'self-granted' FROM source_discovery_grants`,
        `UPDATE source_discovery_grants SET max_runs = 200`,
        `DELETE FROM source_discovery_grants`,
        `DELETE FROM source_discovery_grant_uses`,
        `UPDATE source_discovery_query_calls SET outcome = 'RESULTS'`,
      ]) {
        await client.query('SAVEPOINT s');
        expect(await sqlstate(() => client.query(sql)), sql).toBe('42501');
        await client.query('ROLLBACK TO SAVEPOINT s');
      }
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    // Readable by audit; the owner itself cannot mutate it (append-only trigger).
    expect((await readonly.query(`SELECT id FROM source_discovery_grants`)).rows).toEqual([
      { id: grantId },
    ]);
    expect(
      await sqlstate(() => admin.query(`UPDATE source_discovery_grants SET max_runs = 2`)),
    ).toBe('55000');
  });

  it('a live-provider run cannot commit without a grant use, and calls need a granted run', async () => {
    const client = await source.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nwf_source_discovery');
      const run = await client.query<{ id: string }>(
        `INSERT INTO source_discovery_runs (run_kind, provider_key, brief_id, geography, actor_key, started_at)
         VALUES ('SEARCH_PROVIDER', 'claude-max-web-search', $1, 'JP', 'rogue-path', now()) RETURNING id`,
        [v1BriefId],
      );
      await client.query('SAVEPOINT s');
      expect(
        await sqlstate(() =>
          client.query(
            `INSERT INTO source_discovery_query_calls
               (run_id, call_seq, query_id, outcome, result_count, model_id, sdk_version, smoke,
                started_at, ended_at)
             VALUES ($1, 1, 'jp.ja.language-cafe.01', 'RESULTS', 0, $2, $3, true, now(), now())`,
            [run.rows[0]!.id, MODEL, SDK_VERSION],
          ),
        ),
      ).toBe('23514');
      await client.query('ROLLBACK TO SAVEPOINT s');
      expect(await sqlstate(() => client.query('COMMIT'))).toBe('23514');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    expect(await count('source_discovery_runs')).toBe(0);
  });

  it('two runs racing for the same slot: the database refuses the loser (23505), and a gap (23514)', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
      maxRuns: 3,
    });
    const a = await source.connect();
    const b = await source.connect();
    const begin = async (c: pg.PoolClient): Promise<string> => {
      await c.query('BEGIN');
      await c.query('SET LOCAL ROLE nwf_source_discovery');
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO source_discovery_runs (run_kind, provider_key, brief_id, geography, actor_key, started_at)
         VALUES ('SEARCH_PROVIDER', 'claude-max-web-search', $1, 'JP', 'ww-worker', now()) RETURNING id`,
        [v1BriefId],
      );
      return rows[0]!.id;
    };
    const use = (c: pg.PoolClient, runId: string, seq: number) =>
      c.query(
        `INSERT INTO source_discovery_grant_uses (grant_id, run_id, run_seq, actor_key)
         VALUES ($1, $2, $3, 'ww-worker')`,
        [grantId, runId, seq],
      );
    try {
      const runA = await begin(a);
      const runB = await begin(b);
      await use(a, runA, 1);
      const loser = sqlstate(() => use(b, runB, 1));
      // Wait until b is genuinely blocked on a's uncommitted slot-1 row, so the
      // unique index - not the next-slot check - is what refuses it.
      let blocked = false;
      for (let i = 0; i < 200 && !blocked; i += 1) {
        const { rows } = await admin.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE usename = $1 AND wait_event_type = 'Lock'`,
          [SOURCE_LOGIN],
        );
        blocked = rows[0]!.n > 0;
        if (!blocked) await new Promise((r) => setTimeout(r, 10));
      }
      expect(blocked).toBe(true);
      await a.query('COMMIT');
      expect(await loser).toBe('23505');
      await b.query('ROLLBACK');
      const runC = await begin(b);
      await b.query('SAVEPOINT s');
      expect(await sqlstate(() => use(b, runC, 3))).toBe('23514');
      await b.query('ROLLBACK TO SAVEPOINT s');
      await use(b, runC, 2);
      await b.query('COMMIT');
    } finally {
      await a.query('ROLLBACK').catch(() => undefined);
      await b.query('ROLLBACK').catch(() => undefined);
      a.release();
      b.release();
    }
    const { rows } = await admin.query(
      `SELECT run_seq FROM source_discovery_grant_uses ORDER BY run_seq`,
    );
    expect(rows).toEqual([{ run_seq: 1 }, { run_seq: 2 }]);
    // The next run through the API takes slot 3, the last one.
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(fakeSdk((n) => ok(n))),
    );
    expect(result.runSeq).toBe(3);
    expect(result.calls[0]!.smoke).toBe(false);
  });

  // ------------------------------------------------------------ the CLI

  it('discover-sources --execute --grant-id runs under the grant, and refuses without one', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
      maxQueries: 1,
    });
    const sdk = fakeSdk((n) => ok(n));
    const cli = async (argv: string[]) => {
      let out = '';
      const exit = await runSourceDiscoveryCli(argv, {
        readonlyPool: () => {
          throw new Error('no readonly pool');
        },
        writerPool: () => {
          throw new Error('no writer pool');
        },
        sourceDiscoveryPool: () => new pg.Pool({ connectionString: urlFor(SOURCE_LOGIN), max: 2 }),
        liveSearchDeps: () => deps(sdk),
        out: (t) => void (out += t),
        err: () => undefined,
      });
      return { exit, body: JSON.parse(out) as Record<string, unknown> };
    };
    const ran = await cli(['discover-sources', '--execute', '--grant-id', grantId, '--json']);
    expect(ran.exit).toBe(0);
    expect(ran.body['outcome']).toBe('COMPLETED');
    expect((ran.body['data'] as { runSeq: number }).runSeq).toBe(1);

    const again = await cli(['discover-sources', '--execute', '--grant-id', grantId, '--json']);
    expect([again.exit, again.body['code']]).toEqual([1, 'GRANT_EXHAUSTED']);
    const missing = await cli([
      'discover-sources',
      '--execute',
      '--grant-id',
      '00000000-0000-4000-8000-000000000000',
      '--json',
    ]);
    expect(missing.body['code']).toBe('GRANT_NOT_FOUND');
    const dry = await cli(['discover-sources', '--grant-id', grantId, '--json']);
    expect(dry.body['code']).toBe('INPUT_INVALID');
    const mixed = await cli([
      'discover-sources',
      '--execute',
      '--grant-id',
      grantId,
      '--geography',
      'MX',
      '--json',
    ]);
    expect(mixed.body['code']).toBe('INPUT_INVALID');
    const legacy = await cli([
      'discover-sources',
      '--brief',
      'nwf-discovery-brief-v1',
      '--geography',
      'JP',
      '--execute',
      '--json',
    ]);
    expect(legacy.body['code']).toBe('LIVE_SEARCH_NOT_AUTHORISED');
    expect(sdk.prompts).toHaveLength(1);
  });
});

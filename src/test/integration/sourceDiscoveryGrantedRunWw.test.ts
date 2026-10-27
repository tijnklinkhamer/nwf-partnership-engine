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
import { registerPlan, startGrantedRun } from '../../orgunits/sourceDiscovery/grantStore.js';
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
  | { readonly kind: 'no-result' }
  // WW E-SDFX: an ADVERSARIAL provider that ignores every denial and still
  // returns results - each must fail the call closed with nothing kept.
  | { readonly kind: 'extra-search' }
  | { readonly kind: 'other-query' }
  | { readonly kind: 'domain-override' }
  | { readonly kind: 'parallel-searches' }
  | { readonly kind: 'unchecked-search' };

interface FakeSdk {
  readonly query: SdkQueryFn;
  readonly prompts: string[];
  readonly options: Parameters<SdkQueryFn>[0]['options'][];
  /** Every gate decision the fake SDK received, in order: `${surface}:${tool}:${decision}`. */
  readonly decisions: string[];
}

type SdkOptions = Parameters<SdkQueryFn>[0]['options'];
type Block = {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
};

/** The planned query text, read back from the adapter's deterministic prompt (its third line). */
const plannedOf = (prompt: string): string => JSON.parse(prompt.split('\n')[2]!) as string;

/** An assistant message carrying tool-use blocks, shaped as the SDK streams it. */
const assistant = (blocks: readonly Block[]): SdkStreamMessage => ({
  type: 'assistant',
  message: { content: blocks.map((b) => ({ type: 'tool_use', ...b })) },
});

/**
 * What the SDK does for one tool use under the adapter's options (static
 * reading of the bundled executable, ADR 0028 s9): the PreToolUse hook
 * first; a hook deny ends it; the structured-output carrier is allowed by
 * its own permission check; anything else under permissionMode 'default'
 * with no allow rule asks `canUseTool`.
 */
async function useTool(options: SdkOptions, block: Block, decisions: string[]): Promise<boolean> {
  const signal = new AbortController().signal;
  const hook = options.hooks?.PreToolUse?.[0]?.hooks[0];
  const out = hook
    ? await hook(
        {
          hook_event_name: 'PreToolUse',
          tool_name: block.name,
          tool_input: block.input,
          tool_use_id: block.id,
          session_id: 'fake-session',
          transcript_path: '',
          cwd: '',
        } as never,
        block.id,
        { signal },
      )
    : {};
  const hookDecision =
    'hookSpecificOutput' in out &&
    out.hookSpecificOutput?.hookEventName === 'PreToolUse' &&
    out.hookSpecificOutput.permissionDecision === 'deny'
      ? 'deny'
      : 'pass';
  decisions.push(`hook:${block.name}:${hookDecision}`);
  if (hookDecision === 'deny') return false;
  if (block.name === 'StructuredOutput') return true;
  const decision = await options.canUseTool!(block.name, block.input, {
    signal,
    toolUseID: block.id,
    requestId: `req-${block.id}`,
  });
  decisions.push(`canUseTool:${block.name}:${decision?.behavior}`);
  return decision?.behavior === 'allow';
}

/** A scripted SDK: the n-th call behaves as `script(n)`. Never a network call. */
function fakeSdk(script: (call: number, prompt: string) => Behaviour): FakeSdk {
  const prompts: string[] = [];
  const options: SdkOptions[] = [];
  const decisions: string[] = [];
  const query: SdkQueryFn = (args) => {
    const call = prompts.length;
    prompts.push(args.prompt);
    options.push(args.options);
    const behaviour = script(call, args.prompt);
    const planned = plannedOf(args.prompt);
    const search = (id: string, input: Record<string, unknown> = { query: planned }): Block => ({
      id,
      name: 'WebSearch',
      input,
    });
    const results = (urls: readonly (readonly [string, string])[]): SdkStreamMessage => ({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: 'prose that must never be stored',
      structured_output: {
        results: urls.map(([url, title]) => ({ url, title, snippet: `${title} - community page` })),
      },
    });
    const adversarial = results(okUrls(call));
    return (async function* (): AsyncGenerator<SdkStreamMessage> {
      yield { type: 'system', subtype: 'init' };
      switch (behaviour.kind) {
        case 'results': {
          const s1 = search(`toolu_${call}_search`);
          yield assistant([s1]);
          if (!(await useTool(args.options, s1, decisions))) return;
          const carrier: Block = {
            id: `toolu_${call}_out`,
            name: 'StructuredOutput',
            input: { results: [] },
          };
          yield assistant([carrier]);
          await useTool(args.options, carrier, decisions);
          yield results(behaviour.urls);
          return;
        }
        case 'invalid-output': {
          const s1 = search(`toolu_${call}_search`);
          yield assistant([s1]);
          await useTool(args.options, s1, decisions);
          yield {
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: 'Here are some results: https://prose-fict.jp/',
            structured_output: { results: 'not an array' },
          };
          return;
        }
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
          const fetchUse: Block = {
            id: `toolu_${call}_fetch`,
            name: 'WebFetch',
            input: { url: 'https://www.fetch-me-fict.jp/' },
          };
          yield assistant([fetchUse]);
          expect(await useTool(args.options, fetchUse, decisions)).toBe(false);
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
        case 'extra-search': {
          const s1 = search(`toolu_${call}_a`);
          yield assistant([s1]);
          await useTool(args.options, s1, decisions);
          const s2 = search(`toolu_${call}_b`);
          yield assistant([s2]);
          expect(await useTool(args.options, s2, decisions)).toBe(false);
          yield adversarial;
          return;
        }
        case 'other-query': {
          const s1 = search(`toolu_${call}_a`, { query: 'Jane Fict-Person home address' });
          yield assistant([s1]);
          expect(await useTool(args.options, s1, decisions)).toBe(false);
          yield adversarial;
          return;
        }
        case 'domain-override': {
          const s1 = search(`toolu_${call}_a`, {
            query: planned,
            allowed_domains: ['people-search-fict.jp'],
          });
          yield assistant([s1]);
          expect(await useTool(args.options, s1, decisions)).toBe(false);
          yield adversarial;
          return;
        }
        case 'parallel-searches': {
          const s1 = search(`toolu_${call}_a`);
          const s2 = search(`toolu_${call}_b`);
          yield assistant([s1, s2]);
          const allowed = await Promise.all([
            useTool(args.options, s1, decisions),
            useTool(args.options, s2, decisions),
          ]);
          expect(allowed.filter(Boolean)).toHaveLength(1);
          yield adversarial;
          return;
        }
        case 'unchecked-search': {
          // An SDK path that runs the search without consulting either gate surface.
          yield assistant([search(`toolu_${call}_a`)]);
          yield adversarial;
          return;
        }
      }
    })();
  };
  return { query, prompts, options, decisions };
}

const okUrls = (n: number): readonly (readonly [string, string])[] => [
  [`https://www.q${n}-gogaku-fict.jp/`, `語学交流サークル ${n}`],
  [`https://q${n}-gogaku-fict.jp/events`, 'Events (same domain, deduped)'],
  ['https://www.fict-u.ac.jp/', '架空大学 国際交流センター'],
  ['https://www.facebook.com/groups/fict', 'Social group (refused)'],
];

const ok = (n: number): Behaviour => ({ kind: 'results', urls: okUrls(n) });

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

  /** The OWNER path records a smoke verification for a smoke call (migration 0025). */
  async function recordVerification(runId: string): Promise<void> {
    await admin.query(
      `INSERT INTO source_discovery_smoke_verifications
         (run_id, call_seq, sdk_version, model_id, actor_key)
       VALUES ($1, 1, $2, $3, 'owner-cli')`,
      [runId, SDK_VERSION, MODEL],
    );
  }

  /**
   * WW E-SDFX: the D8 smoke now GATES (migration 0025). A test exercising a
   * run past its first call first performs one real smoke - a one-query MX
   * grant whose one nomination is a domain no other test uses - and records
   * the OWNER verification for (SDK_VERSION, MODEL), exactly as an OWNER
   * would after reading the smoke's searchGate.
   */
  async function verifySmoke(): Promise<void> {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'MX',
      maxQueries: 1,
    });
    const smoke = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-smoke' },
      deps(fakeSdk(() => ({ kind: 'results', urls: [['https://smoke-seed-fict.mx/', 'Seed']] }))),
    );
    expect(smoke.calls).toEqual([
      expect.objectContaining({
        smoke: true,
        outcome: 'RESULTS',
        searchGate: { hookInvoked: true, permissionInvoked: true },
      }),
    ]);
    await recordVerification(smoke.runId);
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
                source_discovery_smoke_verifications, source_discovery_query_call_starts,
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
    await verifySmoke();
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
      // WW E-SDFX: nothing pre-approved; every use reaches the hook and canUseTool.
      expect(o.allowedTools).toEqual([]);
      expect(o.permissionMode).toBe('default');
      expect(o.hooks?.PreToolUse).toHaveLength(1);
      expect(o.hooks?.PreToolUse?.[0]?.hooks).toHaveLength(1);
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

    // Every search passed the gate exactly once per surface; the carrier is never a search.
    expect(sdk.decisions).toEqual(
      section.flatMap(() => [
        'hook:WebSearch:pass',
        'canUseTool:WebSearch:allow',
        'hook:StructuredOutput:pass',
      ]),
    );
    expect(result.calls.map((c) => c.searchGate)).toEqual(
      section.map(() => ({ hookInvoked: true, permissionInvoked: true })),
    );
    const use = await admin.query(
      `SELECT grant_id, run_id, run_seq, actor_key FROM source_discovery_grant_uses
        WHERE grant_id = $1`,
      [grantId],
    );
    expect(use.rows).toEqual([
      { grant_id: grantId, run_id: result.runId, run_seq: 1, actor_key: 'source-discovery-cli' },
    ]);
    const calls = await admin.query(
      `SELECT call_seq, query_id, outcome, result_count, model_id, sdk_version, smoke
         FROM source_discovery_query_calls WHERE run_id = $1 ORDER BY call_seq`,
      [result.runId],
    );
    // Migration 0025: each terminal row has the start the database accepted before the call.
    const starts = await admin.query(
      `SELECT call_seq, query_id, model_id, sdk_version, smoke
         FROM source_discovery_query_call_starts WHERE run_id = $1 ORDER BY call_seq`,
      [result.runId],
    );
    expect(starts.rows).toEqual(
      section.map((q, i) => ({
        call_seq: i + 1,
        query_id: q.queryId,
        model_id: MODEL,
        sdk_version: SDK_VERSION,
        smoke: i === 0,
      })),
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
              nominations_refused, nominations_known FROM source_discovery_run_completions
        WHERE run_id = $1`,
      [result.runId],
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
    await verifySmoke();
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
    await verifySmoke();
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
      `SELECT nominations_known FROM source_discovery_run_completions WHERE run_id = $1`,
      [result.runId],
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
    await verifySmoke();
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
    // WW E-SDFX (P1-3): every way a provider can leave the one planned search.
    ['extra-search', 'SEARCH_BINDING_REFUSED', 'FAILED'],
    ['other-query', 'SEARCH_BINDING_REFUSED', 'FAILED'],
    ['domain-override', 'SEARCH_BINDING_REFUSED', 'FAILED'],
    ['parallel-searches', 'SEARCH_BINDING_REFUSED', 'FAILED'],
    ['unchecked-search', 'SEARCH_BINDING_REFUSED', 'FAILED'],
  ] as const)(
    'a %s on the second query records %s and ends the run %s',
    async (kind, callOutcome, runOutcome) => {
      await verifySmoke();
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
      const stored = await admin.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM source_discovery_nominations
          WHERE discovery_run_id = $1 AND query_id = $2`,
        [result.runId, result.calls[1]!.queryId],
      );
      expect(stored.rows[0]!.n).toBe(0);
      const completion = await admin.query(
        `SELECT outcome, reason, queries_attempted FROM source_discovery_run_completions
          WHERE run_id = $1`,
        [result.runId],
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
    await verifySmoke();
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

  // ------------------------------------------------------------ WW E-SDFX: migration 0025

  it('P2-4: the database clock, not the process clock, refuses a search after the grant expires', async () => {
    await verifySmoke();
    const issued = new Date(Date.now() - HOUR);
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
      issuedAt: issued,
      expiresAt: new Date(Date.now() + 1_500),
    });
    // A process clock that never sees the expiry: only the database can stop the run.
    const frozen = { now: () => new Date(issued.getTime() + 60_000) };
    const sdk = fakeSdk((n) => ok(n));
    const slowFirst: SdkQueryFn = (args) => {
      const inner = sdk.query(args);
      return (async function* () {
        if (sdk.prompts.length === 1) await new Promise((r) => setTimeout(r, 2_000));
        yield* inner;
      })();
    };
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps({ ...sdk, query: slowFirst }, { clock: frozen }),
    );
    expect(result.outcome).toBe('ABORTED');
    expect(result.reason).toBe('GRANT_EXPIRED');
    // The first search was permitted and recorded; no second search was made.
    expect(sdk.prompts).toHaveLength(1);
    expect(result.calls.map((c) => c.outcome)).toEqual(['RESULTS']);
    const rows = await admin.query(
      `SELECT (SELECT count(*)::int FROM source_discovery_query_call_starts WHERE run_id = $1) AS starts,
              (SELECT count(*)::int FROM source_discovery_query_calls WHERE run_id = $1) AS calls,
              (SELECT queries_attempted FROM source_discovery_run_completions WHERE run_id = $1) AS q`,
      [result.runId],
    );
    expect(rows.rows).toEqual([{ starts: 1, calls: 1, q: 1 }]);
  });

  it('P2-5: without an OWNER smoke verification a grant stops after its smoke call', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
      maxQueries: 3,
      maxRuns: 3,
    });
    const sdk = fakeSdk((n) => ok(n));
    const first = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    expect([first.outcome, first.reason]).toEqual(['ABORTED', 'SMOKE_UNVERIFIED']);
    expect(first.calls).toEqual([
      expect.objectContaining({
        callSeq: 1,
        smoke: true,
        outcome: 'RESULTS',
        searchGate: { hookInvoked: true, permissionInvoked: true },
      }),
    ]);
    expect(sdk.prompts).toHaveLength(1);
    // A later run of the grant is refused before it starts: no run row, no slot spent.
    const runsBefore = await count('source_discovery_runs');
    expect(
      await refusalOf(() =>
        runGrantedSourceDiscovery(source, { grantId, actorKey: 'ww-worker' }, deps(sdk)),
      ),
    ).toBe('SMOKE_UNVERIFIED');
    expect(await count('source_discovery_runs')).toBe(runsBefore);
    expect(sdk.prompts).toHaveLength(1);

    // The capability can read verifications and never write one.
    const client = await source.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nwf_source_discovery');
      expect(
        await sqlstate(() =>
          client.query(
            `INSERT INTO source_discovery_smoke_verifications
               (run_id, call_seq, sdk_version, model_id, actor_key)
             VALUES ($1, 1, $2, $3, 'self-verified')`,
            [first.runId, SDK_VERSION, MODEL],
          ),
        ),
      ).toBe('42501');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    // The OWNER path cannot verify a different runtime than the smoke's own.
    expect(
      await sqlstate(() =>
        admin.query(
          `INSERT INTO source_discovery_smoke_verifications
             (run_id, call_seq, sdk_version, model_id, actor_key)
           VALUES ($1, 1, '9.9.9', $2, 'owner-cli')`,
          [first.runId, MODEL],
        ),
      ),
    ).toBe('23514');
    await recordVerification(first.runId);
    // Append-only for the owner too.
    expect(
      await sqlstate(() => admin.query(`DELETE FROM source_discovery_smoke_verifications`)),
    ).toBe('55000');

    const second = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    expect([second.outcome, second.runSeq, second.calls.length]).toEqual(['COMPLETED', 2, 3]);
    expect(second.calls.every((c) => !c.smoke)).toBe(true);
  });

  it('P2-5: only a smoke call that ended RESULTS can be verified', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
    });
    const failed = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(fakeSdk(() => ({ kind: 'invalid-output' }))),
    );
    expect(failed.calls[0]!.outcome).toBe('PROVIDER_OUTPUT_INVALID');
    expect(await sqlstate(() => recordVerification(failed.runId))).toBe('23514');
    expect(await count('source_discovery_smoke_verifications')).toBe(0);
  });

  it('P1-3: a smoke call that leaves the planned search fails closed and keeps nothing', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
    });
    const sdk = fakeSdk(() => ({ kind: 'other-query' }));
    const result = await runGrantedSourceDiscovery(
      source,
      { grantId, actorKey: 'ww-worker' },
      deps(sdk),
    );
    expect([result.outcome, result.reason]).toEqual(['FAILED', 'SEARCH_BINDING_REFUSED']);
    expect(result.calls).toEqual([
      expect.objectContaining({ smoke: true, outcome: 'SEARCH_BINDING_REFUSED', searchGate: null }),
    ]);
    // The hook denied it, so canUseTool was never asked; nothing was kept.
    expect(sdk.decisions).toEqual(['hook:WebSearch:deny']);
    expect(await count('source_discovery_nominations')).toBe(0);
  });

  it('P2-4: the database refuses a search it did not permit first, and a run that drops one', async () => {
    const grantId = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'JP',
      maxQueries: 3,
    });
    const [q1, q2] = queriesFor(NWF_DISCOVERY_BRIEF_V1, 'JP').queries;
    const client = await source.connect();
    const insert = (sql: string, params: unknown[]) => sqlstate(() => client.query(sql, params));
    const start = (runId: string, seq: number, queryId: string, smoke: boolean) =>
      insert(
        `INSERT INTO source_discovery_query_call_starts
           (run_id, call_seq, query_id, model_id, sdk_version, smoke)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [runId, seq, queryId, MODEL, SDK_VERSION, smoke],
      );
    const terminal = (runId: string, seq: number, queryId: string, smoke: boolean) =>
      insert(
        `INSERT INTO source_discovery_query_calls
           (run_id, call_seq, query_id, outcome, result_count, model_id, sdk_version, smoke,
            started_at, ended_at)
         VALUES ($1, $2, $3, 'RESULTS', 0, $4, $5, $6, now(), now())`,
        [runId, seq, queryId, MODEL, SDK_VERSION, smoke],
      );
    const step = async (fn: () => Promise<string>, expected: string) => {
      await client.query('SAVEPOINT s');
      expect(await fn()).toBe(expected);
      if (expected === 'SUCCEEDED') await client.query('RELEASE SAVEPOINT s');
      else await client.query('ROLLBACK TO SAVEPOINT s');
    };
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nwf_source_discovery');
      const { runId } = await startGrantedRun(client, {
        grantId,
        briefId: v1BriefId,
        geography: 'JP',
        providerKey: 'claude-max-web-search',
        actorKey: 'ww-worker',
      });
      // A terminal row the database never permitted.
      await step(() => terminal(runId, 1, q1!.queryId, true), '23514');
      await step(() => start(runId, 1, q1!.queryId, true), 'SUCCEEDED');
      // A second start while the first call has no terminal row.
      await step(() => start(runId, 2, q2!.queryId, false), '23514');
      // A terminal row that does not match its start.
      await step(() => terminal(runId, 1, q2!.queryId, true), '23514');
      await step(() => terminal(runId, 1, q1!.queryId, true), 'SUCCEEDED');
      // Not the smoke, and no OWNER verification exists: refused even bypassing the app.
      await step(() => start(runId, 2, q2!.queryId, false), '23514');
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }

    // The dangling-start rule, on a verified runtime (the owner path seeds the
    // verification), so the second, non-smoke start is permitted.
    await verifySmoke();
    const g2 = await grant({
      briefId: v1BriefId,
      digest: briefDigest(NWF_DISCOVERY_BRIEF_V1),
      geography: 'NL',
      maxQueries: 3,
    });
    const [n1, n2] = queriesFor(NWF_DISCOVERY_BRIEF_V1, 'NL').queries;
    const c2 = await source.connect();
    try {
      await c2.query('BEGIN');
      await c2.query('SET LOCAL ROLE nwf_source_discovery');
      const { runId } = await startGrantedRun(c2, {
        grantId: g2,
        briefId: v1BriefId,
        geography: 'NL',
        providerKey: 'claude-max-web-search',
        actorKey: 'ww-worker',
      });
      const q = (sql: string, params: unknown[]) => c2.query(sql, params);
      await q(
        `INSERT INTO source_discovery_query_call_starts
           (run_id, call_seq, query_id, model_id, sdk_version, smoke) VALUES ($1, 1, $2, $3, $4, true)`,
        [runId, n1!.queryId, MODEL, SDK_VERSION],
      );
      await q(
        `INSERT INTO source_discovery_query_calls
           (run_id, call_seq, query_id, outcome, result_count, model_id, sdk_version, smoke,
            started_at, ended_at) VALUES ($1, 1, $2, 'RESULTS', 0, $3, $4, true, now(), now())`,
        [runId, n1!.queryId, MODEL, SDK_VERSION],
      );
      await q(
        `INSERT INTO source_discovery_query_call_starts
           (run_id, call_seq, query_id, model_id, sdk_version, smoke) VALUES ($1, 2, $2, $3, $4, false)`,
        [runId, n2!.queryId, MODEL, SDK_VERSION],
      );
      const done = (outcome: string, reason: string | null, attempted: number) =>
        sqlstate(() =>
          c2.query(
            `INSERT INTO source_discovery_run_completions
               (run_id, outcome, reason, queries_attempted, nominations_inserted,
                nominations_duplicated, nominations_refused, nominations_known)
             VALUES ($1, $2, $3, $4, 0, 0, 0, 0)`,
            [runId, outcome, reason, attempted],
          ),
        );
      for (const [outcome, reason, attempted, expected] of [
        ['COMPLETED', null, 2, '23514'], // a permitted search with no recorded outcome
        ['FAILED', 'INTERNAL_ERROR', 1, '23514'], // attempted counts the permitted searches
        ['FAILED', 'INTERNAL_ERROR', 2, 'SUCCEEDED'],
      ] as const) {
        await c2.query('SAVEPOINT s');
        expect(await done(outcome, reason, attempted), `${outcome} ${attempted}`).toBe(expected);
        if (expected !== 'SUCCEEDED') await c2.query('ROLLBACK TO SAVEPOINT s');
      }
      await c2.query('ROLLBACK');
    } finally {
      await c2.query('ROLLBACK').catch(() => undefined);
      c2.release();
    }
  });

  it('P2-2: every source-discovery trigger function pins its search_path, pg_temp last', async () => {
    const { rows } = await admin.query<{ name: string; config: string[] | null }>(
      `SELECT p.proname AS name, p.proconfig AS config
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'source\\_discovery\\_%'
        ORDER BY 1`,
    );
    expect(rows.map((r) => r.name)).toEqual(
      expect.arrayContaining([
        'source_discovery_require_grant_use',
        'source_discovery_verify_grant',
        'source_discovery_verify_grant_use',
        'source_discovery_verify_known_mark',
        'source_discovery_verify_query_call',
        'source_discovery_verify_query_call_start',
        'source_discovery_verify_run_completion',
        'source_discovery_verify_smoke_verification',
      ]),
    );
    const live = [
      'source_discovery_require_grant_use',
      'source_discovery_verify_grant',
      'source_discovery_verify_grant_use',
      'source_discovery_verify_known_mark',
      'source_discovery_verify_query_call',
      'source_discovery_verify_query_call_start',
      'source_discovery_verify_run_completion',
      'source_discovery_verify_smoke_verification',
    ];
    for (const r of rows.filter((row) => live.includes(row.name))) {
      expect(r.config, r.name).toEqual(['search_path=public, pg_catalog, pg_temp']);
    }
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
      `SELECT run_seq FROM source_discovery_grant_uses WHERE grant_id = $1 ORDER BY run_seq`,
      [grantId],
    );
    expect(rows).toEqual([{ run_seq: 1 }, { run_seq: 2 }]);
    // Slot 3 is not the grant's first run: it needs the OWNER smoke verification.
    await verifySmoke();
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

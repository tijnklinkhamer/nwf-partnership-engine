/**
 * WW E-W - a SYNTHETIC harness for the wired acquisition pipeline
 * (`*_test` databases only).
 *
 * Disposable logins per capability (worker, writer, reviewer, source
 * discovery), a FAKE Agent SDK, a fake auth-status runner and executable, a
 * SCRIPTED research transport, a synthetic cohort registry, and TEST-ONLY
 * in-memory campaign and review keys - including an ENCRYPTED PKCS#8 review
 * key file written to a fresh 0700 directory so the real custody checks run.
 * Every domain is fictitious (`-fict`). Nothing leaves the process.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

import { testDatabaseUrl } from '../../config/env.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { CampaignTrustSet } from '../../orgunits/acquisition/index.js';
import type { WiringDeps } from '../../orgunits/acquisitionWiring/index.js';
import type { SdkQueryFn, SdkStreamMessage } from '../../orgunits/sourceDiscovery/agentQuery.js';
import { NWF_DISCOVERY_BRIEF_V1, briefDigest } from '../../orgunits/sourceDiscovery/brief.js';
import { SOURCE_DISCOVERY_ALLOWED_MODELS } from '../../orgunits/sourceDiscovery/grant.js';
import {
  inSourceDiscoveryTransaction,
  registerBrief,
} from '../../orgunits/sourceDiscovery/store.js';
import { runGrantedSourceDiscovery } from '../../orgunits/sourceDiscovery/grantedRun.js';
import type { ReviewTrustSet } from '../../orgunits/subjectReview/trust.js';
import {
  campaignTrustEntry,
  testCampaignKey,
  type TestCampaignKey,
} from './acquisitionCampaignFixtures.js';
import { testTrust, trustEntry, type TestReviewKey } from './ownerReviewFixtures.js';
import {
  ALLOW_ALL,
  ScriptedTransport,
  html,
  instantClock,
  page,
  response,
} from './relSubjectHarness.js';
import {
  createDisposableSourceDiscoveryLogin,
  type DisposableLogin,
} from './sourceDiscoveryLogin.js';
import { syntheticCohort } from './syntheticCohortRegistry.js';
import { createPublicKey } from 'node:crypto';
import {
  publicKeyFingerprint,
  rawEd25519PublicKey,
} from '../../orgunits/subjectReview/protocol.js';

export const MODEL = SOURCE_DISCOVERY_ALLOWED_MODELS[2]!;
const HOUR = 3_600_000;

/** One scripted search result: [url, title]. */
export type FakeResult = readonly [string, string];

export interface FakeSdk {
  readonly query: SdkQueryFn;
  readonly calls: () => number;
  /** Every gate decision the fake SDK received, in order: `${surface}:${tool}:${decision}`. */
  readonly decisions: readonly string[];
}

type SdkOptions = Parameters<SdkQueryFn>[0]['options'];
interface ToolUseBlock {
  readonly id: string;
  readonly name: string;
  readonly input: Record<string, unknown>;
}

/** The planned query text, read back from the adapter's deterministic prompt (its third line). */
const plannedOf = (prompt: string): string => JSON.parse(prompt.split('\n')[2]!) as string;

/** An assistant message carrying tool-use blocks, shaped as the SDK streams it. */
const assistant = (blocks: readonly ToolUseBlock[]): SdkStreamMessage => ({
  type: 'assistant',
  message: { content: blocks.map((b) => ({ type: 'tool_use', ...b })) },
});

/**
 * WW E-SDFX (ADR 0028 s9): what the SDK does for one tool use under the
 * adapter's options - the PreToolUse hook first (a deny ends it), the
 * structured-output carrier allowed by its own permission check, anything
 * else asks `canUseTool`. The same reading
 * `sourceDiscoveryGrantedRunWw.test.ts` scripts; nothing is pre-approved.
 */
async function useTool(
  options: SdkOptions,
  block: ToolUseBlock,
  decisions: string[],
): Promise<boolean> {
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
  const denied =
    'hookSpecificOutput' in out &&
    out.hookSpecificOutput?.hookEventName === 'PreToolUse' &&
    out.hookSpecificOutput.permissionDecision === 'deny';
  decisions.push(`hook:${block.name}:${denied ? 'deny' : 'pass'}`);
  if (denied) return false;
  if (block.name === 'StructuredOutput') return true;
  const decision = await options.canUseTool!(block.name, block.input, {
    signal,
    toolUseID: block.id,
    requestId: `req-${block.id}`,
  });
  decisions.push(`canUseTool:${block.name}:${decision?.behavior}`);
  return decision?.behavior === 'allow';
}

/**
 * A fake SDK whose every call performs exactly ONE WebSearch for the planned
 * query - through the adapter's gate (hook, then canUseTool) - and returns
 * `results`. A denied search ends the stream with no result. Never a network
 * call.
 */
export function fakeSdk(results: readonly FakeResult[]): FakeSdk {
  let calls = 0;
  const decisions: string[] = [];
  const query: SdkQueryFn = (args) => {
    calls += 1;
    const call = calls;
    const search: ToolUseBlock = {
      id: `toolu_${call}_search`,
      name: 'WebSearch',
      input: { query: plannedOf(args.prompt) },
    };
    const carrier: ToolUseBlock = {
      id: `toolu_${call}_out`,
      name: 'StructuredOutput',
      input: { results: [] },
    };
    return (async function* (): AsyncGenerator<SdkStreamMessage> {
      yield { type: 'system', subtype: 'init' };
      yield assistant([search]);
      if (!(await useTool(args.options, search, decisions))) return;
      yield assistant([carrier]);
      await useTool(args.options, carrier, decisions);
      yield {
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: 'prose that must never be stored',
        structured_output: {
          results: results.map(([url, title]) => ({ url, title, snippet: `${title} page` })),
        },
      };
    })();
  };
  return { query, calls: () => calls, decisions };
}

/** The pipeline's fictitious world. */
export const SITES = {
  echeDup: 'https://www.eche-dup-fict.jp/',
  university: 'https://www.fict-u.ac.jp/',
  association: 'https://www.tandem-assoc-fict.jp/',
  buddy: 'https://www.buddy-group-fict.jp/',
} as const;

export const SEARCH_RESULTS: readonly FakeResult[] = [
  [SITES.echeDup, 'ECHE Duplicate Institute'],
  [SITES.university, 'Fict University International Office'],
  [SITES.association, 'Tandem Exchange Association'],
];

/** The scripted research web: robots allow-all, one page per site, one link-out. */
export function researchTransport(): ScriptedTransport {
  const t = new ScriptedTransport();
  for (const site of [SITES.university, SITES.association, SITES.buddy, SITES.echeDup]) {
    t.route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'));
  }
  t.route(
    SITES.association,
    html(
      page('en', 'Tandem Exchange Association', 'Weekly language exchange for students.', [
        ['/events/', 'Events'],
        [SITES.buddy, 'Buddy Group Tokyo'],
      ]),
    ),
  );
  t.route(
    `${SITES.association}events/`,
    html(page('en', 'Events', 'Language cafe every Tuesday.')),
  );
  t.route(SITES.university, html(page('en', 'International Office', 'Exchange students.')));
  t.route(SITES.buddy, html(page('en', 'Buddy Group Tokyo', 'Buddies for exchange students.')));
  return t;
}

export interface WiringHarness {
  readonly admin: pg.Pool;
  readonly readonly: pg.Pool;
  readonly research: pg.Pool;
  readonly worker: pg.Pool;
  readonly writer: pg.Pool;
  readonly reviewer: pg.Pool;
  readonly source: pg.Pool;
  readonly environmentId: string;
  readonly campaignKey: TestCampaignKey;
  readonly campaignTrust: CampaignTrustSet;
  readonly reviewKey: TestReviewKey;
  readonly reviewTrust: ReviewTrustSet;
  /** Absolute canonical path of the ENCRYPTED review key file, and its passphrase. */
  readonly reviewKeyFile: string;
  readonly reviewPassphrase: string;
  readonly outboxDir: string;
  readonly loadCohortRegistry: () => RegistryLoadResult;
  deps(sdk: FakeSdk, transport: ScriptedTransport): WiringDeps;
  /** A factory of FRESH pools (the CLI ends the pools it is given). */
  poolFactory(which: 'admin' | 'readonly' | 'worker' | 'reviewer'): () => pg.Pool;
  /** Registers the v1 brief and records one OWNER-path grant (JP, one query). */
  grant(geography?: string): Promise<string>;
  /** One ECHE website claim on `domain` (a duplicate for the pipeline). */
  echeClaim(domain: string): Promise<void>;
  /**
   * WW H-ACQ (P1-9): the OWNER's D8 smoke verification for the fake SDK's
   * runtime, recorded the way an OWNER would: one granted run (its own grant,
   * its own fake SDK) whose smoke call is then verified on the owner path. A
   * campaign's later smoke calls under the same SDK version and model are
   * covered by it (migration 0025).
   */
  verifySmokeRuntime(): Promise<void>;
  tearDown(): Promise<void>;
}

export async function createWiringHarness(tag: string): Promise<WiringHarness> {
  const adminUrl = testDatabaseUrl('admin')!;
  const admin = new pg.Pool({ connectionString: adminUrl, max: 4 });
  const readonly = new pg.Pool({ connectionString: testDatabaseUrl('readonly')!, max: 4 });
  const research = new pg.Pool({ connectionString: testDatabaseUrl('research')!, max: 4 });
  const suffix = randomBytes(4).toString('hex');
  const password = randomBytes(24).toString('hex');
  const logins: string[] = [];
  const urls: Record<string, string> = {
    admin: adminUrl,
    readonly: testDatabaseUrl('readonly')!,
  };
  const loginPool = async (capability: string): Promise<pg.Pool> => {
    const login = `nwf_${tag}_${capability.replace(/^nwf_/, '').slice(0, 20)}_${suffix}`;
    await admin.query(`CREATE ROLE ${login} LOGIN PASSWORD '${password}'`);
    await admin.query(`GRANT ${capability} TO ${login}`);
    logins.push(login);
    const url = new URL(adminUrl);
    url.username = login;
    url.password = password;
    urls[capability] = url.toString();
    return new pg.Pool({ connectionString: url.toString(), max: 4 });
  };
  const worker = await loginPool('nwf_acquisition_worker');
  const writer = await loginPool('nwf_discovery_subject_writer');
  const reviewer = await loginPool('nwf_discovery_subject_reviewer');
  const sourceLogin: DisposableLogin = await createDisposableSourceDiscoveryLogin(admin, adminUrl);
  const source = new pg.Pool({ connectionString: sourceLogin.url, max: 4 });

  const { rows: env } = await admin.query<{ id: string }>(
    'SELECT environment_id AS id FROM subject_review_environment',
  );
  const campaignKey = testCampaignKey(`test-campaign-${tag}`);
  const campaignTrust = CampaignTrustSet.vitestOnly([campaignTrustEntry(campaignKey)]);

  // A review key that ALSO exists as an encrypted PKCS#8 file, so the CLI's
  // real custody checks (absolute canonical path, 0600, 0700 dir) run.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `nwf-${tag}-key-`)));
  chmodSync(dir, 0o700);
  const reviewPassphrase = randomBytes(12).toString('hex');
  const { privateKey } = generateKeyPairSync('ed25519');
  const reviewKeyFile = join(dir, 'owner-review.pem');
  writeFileSync(
    reviewKeyFile,
    privateKey.export({
      format: 'pem',
      type: 'pkcs8',
      cipher: 'aes-256-cbc',
      passphrase: reviewPassphrase,
    }),
    { mode: 0o600 },
  );
  const publicKeyRaw = rawEd25519PublicKey(createPublicKey(privateKey));
  const reviewKey: TestReviewKey = {
    keyId: `test-owner-${tag}`,
    privateKey,
    publicKeyRaw,
    fingerprint: publicKeyFingerprint(publicKeyRaw),
  };
  const reviewTrust = testTrust(trustEntry(reviewKey));

  const outboxDir = realpathSync(mkdtempSync(join(tmpdir(), `nwf-${tag}-outbox-`)));
  const homeDir = realpathSync(mkdtempSync(join(tmpdir(), `nwf-${tag}-home-`)));
  const profileDir = realpathSync(mkdtempSync(join(tmpdir(), `nwf-${tag}-profile-`)));
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();

  return {
    admin,
    readonly,
    research,
    worker,
    writer,
    reviewer,
    source,
    environmentId: env[0]!.id,
    campaignKey,
    campaignTrust,
    reviewKey,
    reviewTrust,
    reviewKeyFile,
    reviewPassphrase,
    outboxDir,
    loadCohortRegistry,
    poolFactory(which) {
      const url =
        which === 'worker'
          ? urls['nwf_acquisition_worker']!
          : which === 'reviewer'
            ? urls['nwf_discovery_subject_reviewer']!
            : urls[which]!;
      return () => new pg.Pool({ connectionString: url, max: 2 });
    },
    deps(sdk, transport) {
      return {
        pools: { worker, sourceDiscovery: source, writer, research, readonly },
        liveSearch: {
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
          env: () => ({
            HOME: homeDir,
            NWF_PE_CLASSIFIER_CONFIG_DIR: profileDir,
            PATH: '/usr/bin',
          }),
          repoRoot: process.cwd(),
          claudeCodeExecutable: () => ({
            ok: true,
            provenance: {
              executablePath: '/opt/fake-claude/claude',
              packageRoot: '/opt/fake-claude',
              sdkPackageName: '@fake/sdk',
              sdkVersion: '0.3.251',
              claudeCodeVersion: '2.1.251',
              nativePackageName: '@fake/native',
              nativePackageVersion: '0.3.251',
              platformKey: 'darwin-arm64',
              binaryFileName: 'claude',
              binaryBytes: 1,
              binarySha256: 'a'.repeat(64),
            },
          }),
          clock: { now: () => new Date() },
        },
        research: { transport, clock: instantClock(), loadCohortRegistry },
        campaignTrustScope: 'TEST_ONLY',
        outboxDir,
        networkVantage: 'test',
      };
    },
    async grant(geography = 'JP') {
      const briefId = await inSourceDiscoveryTransaction(source, (c) =>
        registerBrief(c, NWF_DISCOVERY_BRIEF_V1),
      );
      const issued = new Date(Date.now() - HOUR);
      const { rows } = await admin.query<{ id: string }>(
        `INSERT INTO source_discovery_grants
           (brief_id, plan_digest, geography, provider_key, model_id, max_queries,
            max_results_per_query, max_runs, issued_at, expires_at, actor_key)
         VALUES ($1, $2, $3, 'claude-max-web-search', $4, 1, 20, 3, $5, $6, 'owner-cli')
         RETURNING id`,
        [
          briefId,
          briefDigest(NWF_DISCOVERY_BRIEF_V1),
          geography,
          MODEL,
          issued.toISOString(),
          new Date(issued.getTime() + 24 * HOUR).toISOString(),
        ],
      );
      return rows[0]!.id;
    },
    async echeClaim(domain) {
      const run = await admin.query<{ id: string }>(
        `INSERT INTO ingest_runs (source_system, source_input_kind, status)
         VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
      );
      const key = `X EW${randomBytes(2).toString('hex').toUpperCase()}|9${Date.now() % 100000000}`;
      await admin.query(
        `INSERT INTO website_claims
           (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
            structural_status, normalised_url, hostname, registrable_domain,
            rule_version, source_artifact_sha256, observed_at, ingest_run_id)
         VALUES ('ECHE_PUBLISHED', $1, NULL, $1, $2, 'STRUCTURALLY_VALID', $3, $2, $4,
                 'test-rules-1', repeat('a', 64), now(), $5)`,
        [key, `www.${domain}`, `https://www.${domain}/`, domain, run.rows[0]!.id],
      );
    },
    async verifySmokeRuntime(this: WiringHarness) {
      const grantId = await this.grant('JP');
      const sdk = fakeSdk([]);
      const deps = this.deps(sdk, researchTransport()).liveSearch;
      const run = await runGrantedSourceDiscovery(
        source,
        { grantId, actorKey: 'test-smoke-run' },
        deps,
      );
      await admin.query(
        `INSERT INTO source_discovery_smoke_verifications
           (run_id, call_seq, sdk_version, model_id, actor_key)
         SELECT run_id, call_seq, sdk_version, model_id, 'owner-cli'
           FROM source_discovery_query_calls WHERE run_id = $1 AND call_seq = 1`,
        [run.runId],
      );
    },
    async tearDown() {
      await Promise.all([worker, writer, reviewer, source].map((p) => p.end()));
      for (const login of logins) {
        await admin.query(`DROP OWNED BY ${login}`).catch(() => undefined);
        await admin.query(`DROP ROLE IF EXISTS ${login}`);
      }
      await sourceLogin.drop();
      await Promise.all([admin.end(), readonly.end(), research.end()]);
      for (const d of [dir, outboxDir, homeDir, profileDir])
        rmSync(d, { recursive: true, force: true });
    },
  };
}

/** Every table the wired pipeline writes, truncated (owner-only test cleanup). */
export async function truncateWiring(admin: pg.Pool): Promise<void> {
  await admin.query(
    `TRUNCATE acquisition_claim_lease_extensions, acquisition_outbox_entries, acquisition_signals,
              acquisition_campaign_subjects, acquisition_worker_stops, acquisition_work_outcomes,
              acquisition_work_claims, acquisition_work_items, acquisition_campaign_control_events,
              acquisition_campaigns,
              source_discovery_nomination_known_marks, source_discovery_run_completions,
              source_discovery_query_calls, source_discovery_grant_uses, source_discovery_grants,
              source_discovery_nomination_sightings, source_discovery_nomination_identities,
              source_discovery_nominations, source_discovery_runs, source_discovery_briefs,
              subject_research_admission_revocations, subject_research_admissions,
              subject_review_attestations, subject_jurisdiction_claims,
              discovery_subject_reviews, discovery_subject_relationship_claims,
              discovery_subject_identity_claims, discovery_subjects,
              orgunit_page_candidates, orgunit_page_evidence, orgunit_redirect_observations,
              orgunit_fetch_observations, orgunit_research_run_completions, orgunit_research_runs,
              website_claims, ingest_runs CASCADE`,
  );
}

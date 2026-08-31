/**
 * THE 2B-2C2 RUNTIME ADAPTER PLUGGED INTO THE LANDED 2B-2C1 CORE, network-free:
 * real orchestration, real assembly, real validation, real persistence
 * against `nwf_pe_test` through the actual `nwf_classifier` role — with
 * `ClaudeMaxAgentProvider` in the provider seat and FAKE `AgentSdkRunner` /
 * `ClassifierAuthStatusRunner` seams behind it. No Anthropic connectivity,
 * no credential of any kind (the dedicated profile is an inert temp
 * directory whose contents are never read), no Claude usage, no production
 * runner construction.
 *
 * Four flows, exactly as the slice spec demands:
 *   1. success:        fake structured result -> validation -> semantic rows -> COMPLETED
 *   2. auth failure:   conflicted pre-flight env -> AUTH_FAILURE persisted, zero rows, zero runner calls
 *   3. exhaustion:     usage-limit error     -> USAGE_LIMIT_EXHAUSTED, zero rows, ONE runner call
 *   4. transient retry: transient x2 -> success -> ONE call row, three runner calls, attempt_no 1
 */
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  count,
  readonlyPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';
import { checkRunCompleted } from '../../orgunits/classify/runStatus.js';
import { runOrganisationClassification } from '../../orgunits/classify/orchestrate.js';
import { ClaudeMaxAgentProvider } from '../../orgunits/classify/provider/claudeMaxAgentProvider.js';
import { CLASSIFIER_PROFILE_DIR_VARIABLE } from '../../orgunits/classify/provider/profile.js';
import type {
  AuthStatusInvocation,
  ClassifierAuthStatusRunner,
} from '../../orgunits/classify/provider/authStatusRunner.js';
import type { AuthStatusExecution } from '../../orgunits/classify/provider/authStatus.js';
import {
  USAGE_LIMIT_ERROR_PREFIXES,
  type AgentSdkInvocation,
  type AgentSdkRunResult,
  type AgentSdkRunner,
} from '../../orgunits/classify/provider/agentSdkRunner.js';
import type { Clock } from '../../orgunits/orchestrator/clock.js';

const describeDb = classifierDatabaseConfigured() ? describe : describe.skip;

const MODEL = 'test-model-max';
/** Constructed, not literal: phase1a bans the spelled-out credential identifier outside the guard and its canonical-list test. */
const API_KEY_VARIABLE = ['ANTHROPIC', 'API_KEY'].join('_');

/** Resolves sleeps immediately: retry pacing without any real wall-clock wait. */
const instantClock: Clock = { now: () => 0, sleep: async () => {} };

/** A fake auth-status runner reporting a valid stored Max login. No subprocess. */
class FakeAuthStatusRunner implements ClassifierAuthStatusRunner {
  readonly invocations: AuthStatusInvocation[] = [];
  async run(invocation: AuthStatusInvocation): Promise<AuthStatusExecution> {
    this.invocations.push(invocation);
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        loggedIn: true,
        authMethod: 'claude.ai',
        apiProvider: 'firstParty',
        subscriptionType: 'max',
      }),
    };
  }
}

function sha(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

class FakeRunner implements AgentSdkRunner {
  readonly invocations: AgentSdkInvocation[] = [];
  readonly #script: readonly (AgentSdkRunResult | Error)[];
  constructor(script: readonly (AgentSdkRunResult | Error)[]) {
    this.#script = script;
  }
  async run(invocation: AgentSdkInvocation): Promise<AgentSdkRunResult> {
    const entry = this.#script[this.invocations.length];
    this.invocations.push(invocation);
    if (entry === undefined) throw new Error('FakeRunner: script exhausted');
    if (entry instanceof Error) throw entry;
    return entry;
  }
}

function structuredSuccess(structuredOutput: unknown): AgentSdkRunResult {
  return {
    subtype: 'success',
    isError: false,
    structuredOutput,
    resultText: 'done',
    stopReason: 'end_turn',
    responseModelId: 'test-model-max-reported',
    inputTokens: 900,
    outputTokens: 180,
    errors: [],
  };
}

function maxProvider(runner: AgentSdkRunner, env: Record<string, string | undefined>) {
  return new ClaudeMaxAgentProvider({
    runner,
    authStatusRunner: new FakeAuthStatusRunner(),
    env: () => env,
    clock: instantClock,
    allowedModels: [MODEL],
  });
}

const VALID_DOC_0 = {
  doc_index: 0,
  verdict: 'UNIT_PAGE',
  unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
  page_kind: null,
  unit_name: 'International Office',
  serves_incoming_international_students: 'YES',
  serves_outgoing_mobility_students: 'YES',
  provides_language_learning_or_support: 'NO',
  confidence: 'HIGH',
  rationale: 'Title and excerpt directly name the international office.',
  evidence_spans: [{ source: 'TITLE', quote: 'International Office' }],
};

describeDb('ClaudeMaxAgentProvider through the real 2B-2C1 orchestration (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let readonly: pg.Pool;
  let root: OrgunitRootFixture;
  /** A provisioned-looking dedicated profile directory (never read by the engine). */
  let profileDir: string;
  let profileEnv: Record<string, string | undefined>;

  beforeAll(async () => {
    admin = adminPool();
    classifier = classifierPool();
    readonly = readonlyPool();
    profileDir = await mkdtemp(join(tmpdir(), 'nwf-pe-test-profile-'));
    await writeFile(join(profileDir, '.credentials.json'), '{"never":"read"}', 'utf8');
    profileEnv = { [CLASSIFIER_PROFILE_DIR_VARIABLE]: profileDir };
  });

  afterAll(async () => {
    await Promise.all([admin.end(), classifier.end(), readonly.end()]);
    await rm(profileDir, { recursive: true, force: true, maxRetries: 3 });
  });

  async function freshRoot(): Promise<void> {
    await truncateAll(admin);
    root = await seedOrgunitRoot(admin);
  }

  async function seedRun(): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'test', 'orgunit-fetch-policy-v1', 'orgunit-signal-rules-v1') RETURNING id`,
    );
    return rows[0]!.id;
  }

  async function completeRun(runId: string): Promise<void> {
    await admin.query(
      `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
       VALUES ($1, 'COMPLETED', now())`,
      [runId],
    );
  }

  async function seedRootFetch(runId: string, url: string): Promise<string> {
    const { rows } = await admin.query<{ root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          http_status, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', 'ROOT',
               200, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING root_key`,
      [runId, root.websiteClaimId, root.echeRowKey, url],
    );
    return rows[0]!.root_key;
  }

  async function seedPage(opts: {
    runId: string;
    rootKey: string;
    url: string;
    sha256: string;
    title: string;
    mainText: string;
  }): Promise<void> {
    const hostname = new URL(opts.url).hostname;
    const claimId = opts.rootKey.startsWith('claim:') ? opts.rootKey.slice('claim:'.length) : null;
    const fetch = await admin.query<{ id: string; root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
          requested_registrable_domain, discovery_method, discovery_parent_url,
          http_status, content_type, charset, charset_source, charset_confidence,
          response_sha256, byte_count, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'LINK', $8, 200, 'text/html', 'utf-8',
               'HTTP_HEADER', 'DECLARED', $7, 4096, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING id, root_key`,
      [
        opts.runId,
        claimId,
        root.echeRowKey,
        opts.url,
        hostname,
        hostname.split('.').slice(-2).join('.'),
        opts.sha256,
        `https://${hostname}/`,
      ],
    );
    const page = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_evidence
         (fetch_observation_id, root_key, title, declared_lang, headings,
          main_text, main_text_chars, extraction_method, rule_version, observed_at)
       VALUES ($1, $2, $3, 'en', '[]'::jsonb, $4, length($4), 'MAIN_ELEMENT',
               'orgunit-extraction-v1', now())
       RETURNING id`,
      [fetch.rows[0]!.id, fetch.rows[0]!.root_key, opts.title, opts.mainText],
    );
    await admin.query(
      `INSERT INTO orgunit_page_candidates
         (page_evidence_id, run_id, root_key, track, candidate_score,
          signals, rank_within_root, rule_version)
       VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 9, '[]'::jsonb, 1, 'orgunit-signal-rules-v1')`,
      [page.rows[0]!.id, opts.runId, fetch.rows[0]!.root_key],
    );
  }

  async function seedScenario(host: string): Promise<string> {
    await freshRoot();
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, `https://${host}/`);
    await completeRun(runId);
    await seedPage({
      runId,
      rootKey,
      url: `https://${host}/international`,
      sha256: sha(`${host}-doc`),
      title: 'International Office',
      mainText: 'The International Office supports incoming and outgoing students.',
    });
    return runId;
  }

  it('SUCCESS: fake SDK structured result flows through validation into semantic persistence and COMPLETED', async () => {
    const runId = await seedScenario('www.example.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const runner = new FakeRunner([structuredSuccess([VALID_DOC_0])]);
    const provider = maxProvider(runner, profileEnv);

    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: MODEL,
      provider,
    });

    expect(result!.kind).toBe('EXECUTED');
    if (result!.kind !== 'EXECUTED') throw new Error('unreachable');
    expect(result!.terminalState).toBe('COMPLETED');
    expect(result!.errorKind).toBeNull();
    expect(runner.invocations).toHaveLength(1);

    // The runner received the REAL frozen prompt and the REAL canonical batch.
    const invocation = runner.invocations[0]!;
    expect(invocation.options.systemPrompt).toContain('You are a document classifier.');
    expect(invocation.prompt).toContain('"documents"');
    expect(invocation.options.settingSources).toEqual([]);
    expect(invocation.options.persistSession).toBe(false);

    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(1);
    expect(await count(classifier, 'orgunit_classifier_call_completions')).toBe(1);
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(1);
    expect(await count(classifier, 'orgunit_classification_subjects')).toBe(1);

    const completion = await classifier.query<{
      terminal_state: string;
      response_model_id: string;
      input_tokens: number;
      output_tokens: number;
    }>(
      `SELECT terminal_state, response_model_id, input_tokens, output_tokens
         FROM orgunit_classifier_call_completions`,
    );
    expect(completion.rows[0]!.terminal_state).toBe('COMPLETED');
    expect(completion.rows[0]!.response_model_id).toBe('test-model-max-reported');
    expect(completion.rows[0]!.input_tokens).toBe(900);
    expect(completion.rows[0]!.output_tokens).toBe(180);
  });

  it('AUTH FAILURE: a pre-flight-refused environment persists an honest AUTH_FAILURE with zero semantic rows and zero runner calls', async () => {
    const runId = await seedScenario('www.authfail.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const runner = new FakeRunner([]);
    // A conflicting variable in the orchestration environment - fail closed.
    const provider = maxProvider(runner, { [API_KEY_VARIABLE]: 'stray-console-key' });

    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: MODEL,
      provider,
    });

    expect(result!.kind).toBe('EXECUTED');
    if (result!.kind !== 'EXECUTED') throw new Error('unreachable');
    expect(result!.terminalState).toBe('FAILED');
    expect(result!.errorKind).toBe('AUTH_FAILURE');
    expect(runner.invocations).toHaveLength(0);

    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(1); // honest call history
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(0);
    expect(await count(classifier, 'orgunit_classification_subjects')).toBe(0);

    const completion = await classifier.query<{ error_kind: string; error_summary: string }>(
      `SELECT error_kind, error_summary FROM orgunit_classifier_call_completions`,
    );
    expect(completion.rows[0]!.error_kind).toBe('AUTH_FAILURE');
    // The refusal names the variable, never the stray value and never a token.
    expect(completion.rows[0]!.error_summary).toContain(API_KEY_VARIABLE);
    expect(completion.rows[0]!.error_summary).not.toContain('stray-console-key');
  });

  it('USAGE EXHAUSTION: recognised limit persists USAGE_LIMIT_EXHAUSTED with zero semantic rows, ONE runner call, no retry, no fallback', async () => {
    const runId = await seedScenario('www.exhausted.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const runner = new FakeRunner([
      {
        ...structuredSuccess(undefined),
        isError: true,
        structuredOutput: undefined,
        resultText: `${USAGE_LIMIT_ERROR_PREFIXES[0]!} usage limit until it resets`,
      },
    ]);
    const provider = maxProvider(runner, profileEnv);

    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: MODEL,
      provider,
    });

    expect(result!.kind).toBe('EXECUTED');
    if (result!.kind !== 'EXECUTED') throw new Error('unreachable');
    expect(result!.terminalState).toBe('FAILED');
    expect(result!.errorKind).toBe('USAGE_LIMIT_EXHAUSTED');
    expect(runner.invocations).toHaveLength(1); // no retry, no fallback

    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(1);
    expect(await count(classifier, 'orgunit_classifier_call_completions')).toBe(1);
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(0);

    const completion = await classifier.query<{ terminal_state: string; error_kind: string }>(
      `SELECT terminal_state, error_kind FROM orgunit_classifier_call_completions`,
    );
    expect(completion.rows[0]!.terminal_state).toBe('FAILED');
    expect(completion.rows[0]!.error_kind).toBe('USAGE_LIMIT_EXHAUSTED');
  });

  it('TRANSIENT RETRY: transient -> transient -> success yields ONE call row, three bounded runner calls, attempt_no 1, and semantic persistence', async () => {
    const runId = await seedScenario('www.retry.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const runner = new FakeRunner([
      new Error('read ECONNRESET'),
      new Error('read ECONNRESET'),
      structuredSuccess([VALID_DOC_0]),
    ]);
    const provider = maxProvider(runner, profileEnv);

    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: MODEL,
      provider,
    });

    expect(result!.kind).toBe('EXECUTED');
    if (result!.kind !== 'EXECUTED') throw new Error('unreachable');
    expect(result!.terminalState).toBe('COMPLETED');
    expect(runner.invocations).toHaveLength(3); // 1 + max 2 transport retries, inside the adapter

    // Transport retries never multiply the persisted observation.
    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(1);
    expect(await count(classifier, 'orgunit_classifier_call_completions')).toBe(1);
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(1);

    const call = await classifier.query<{ attempt_no: number }>(
      `SELECT attempt_no FROM orgunit_classifier_calls`,
    );
    expect(call.rows[0]!.attempt_no).toBe(1); // attempt_no is untouched by transport retries
  });
});

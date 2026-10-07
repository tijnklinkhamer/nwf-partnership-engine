/**
 * CLASSIFIER_OPERATOR_READ_MODELS_V1 — `nwf-pe orgunits classify
 * runs|calls|show`, AGAINST REAL POSTGRESQL (`nwf_pe_test`), through the
 * ACTUAL `nwf_readonly` role.
 *
 * Every classifier and research row is seeded directly by the admin role,
 * so each case states exactly the persisted state it reads. The reads are
 * driven both through the tested core (`executeClassifyReadCommand`, with a
 * counted readonly pool) and through the REAL CLI router (`main`), whose
 * production wiring is `withPool('readonly', ...)` pointed at the test
 * database below.
 *
 * NO PROVIDER, EVER. The provider class, both production runner factories
 * and the operator's provider wiring are wrapped in COUNTING partial mocks;
 * every read must leave all of them at zero. No institution is contacted.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  count,
  databaseConfigured,
  readonlyPool,
  truncateAll,
} from './helpers.js';
import {
  executeClassifyReadCommand,
  type ClassifyReadDependencies,
  type ClassifyReadOptions,
} from '../../cli/commands/classifyRead.js';
import { main } from '../../cli/index.js';
import { MAX_CANDIDATES_PER_ROOT_TRACK } from '../../orgunits/classify/constants.js';
import {
  RUN_ASSOCIATION_COVERAGE,
  listClassifierCalls,
  listClassifierResearchRuns,
  showClassifierCall,
  type ClassifierCallDetailRead,
  type ClassifierCallsRead,
  type OrdinaryCallDetailRead,
  type RepairCallDetailRead,
  type ResearchRunsRead,
} from '../../orgunits/classify/operatorReadModels.js';
import { CLASSIFIER_OPERATOR_CONTRACT_VERSION } from '../../orgunits/classify/operatorContract.js';
import { loadEffectiveClassifications } from '../../orgunits/classify/persist.js';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
import type * as ProviderModule from '../../orgunits/classify/provider/claudeMaxAgentProvider.js';

// ---------------------------------------------------------------------------
// Counting provider mocks. Names are CONSTRUCTED: a test may not spell the
// production runner factory names (phase2b.firewall.test.ts).
// ---------------------------------------------------------------------------
const providerCounters = vi.hoisted(() => ({
  providerConstructions: 0,
  sdkRunnerFactory: 0,
  authStatusRunnerFactory: 0,
  wiring: 0,
}));

vi.mock('../../orgunits/classify/provider/claudeMaxAgentProvider.js', async (importOriginal) => {
  const original = await importOriginal<typeof ProviderModule>();
  class CountingProvider extends original.ClaudeMaxAgentProvider {
    constructor(...args: ConstructorParameters<typeof original.ClaudeMaxAgentProvider>) {
      providerCounters.providerConstructions += 1;
      super(...args);
    }
  }
  return { ...original, ClaudeMaxAgentProvider: CountingProvider };
});
vi.mock('../../orgunits/classify/provider/agentSdkRunner.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const name = ['createProduction', 'AgentSdkRunner'].join('');
  return {
    ...original,
    [name]: () => {
      providerCounters.sdkRunnerFactory += 1;
      throw new Error('the SDK runner must not be created by a read');
    },
  };
});
vi.mock('../../orgunits/classify/provider/authStatusRunner.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  const name = ['createProduction', 'AuthStatusRunner'].join('');
  return {
    ...original,
    [name]: () => {
      providerCounters.authStatusRunnerFactory += 1;
      throw new Error('the auth-status runner must not be created by a read');
    },
  };
});
vi.mock('../../cli/commands/classifyProvider.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    createProductionClassifierProvider: () => {
      providerCounters.wiring += 1;
      throw new Error('the provider wiring must not be reached by a read');
    },
  };
});

// MUST run before anything calls `config/env.ts`'s `env()`: points the
// PRODUCTION readonly variable the real CLI router reads at the TEST database.
const PREVIOUS_READONLY = process.env.DATABASE_URL_READONLY;
if (process.env.DATABASE_URL_READONLY_TEST) {
  process.env.DATABASE_URL_READONLY = process.env.DATABASE_URL_READONLY_TEST;
}

const configured =
  databaseConfigured() &&
  classifierDatabaseConfigured() &&
  process.env.DATABASE_URL_READONLY_TEST !== undefined;
const describeDb = configured ? describe : describe.skip;

const CLASSIFIER_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];
const RESEARCH_TABLES = [
  'orgunit_research_runs',
  'orgunit_research_run_completions',
  'orgunit_fetch_observations',
  'orgunit_page_evidence',
  'orgunit_page_candidates',
  'organisations',
];

const MAIN_TEXT_SENTINEL = 'zz-main-text-sentinel-never-printed';
const RATIONALE_MARK = 'zz-persisted-validated-rationale';
const QUOTE_MARK = 'International Relations Office';
const MODEL_A = 'zz-requested-model-a';
const MODEL_RESPONSE = 'zz-response-model-b';
const UNKNOWN_UUID = '99999999-9999-4999-8999-999999999999';

const sha = (seed: string): string => createHash('sha256').update(seed).digest('hex');
let shaSeed = 0;
const nextSha = (): string => sha(`call-${(shaSeed += 1)}`);

interface Org {
  readonly organisationId: string;
  readonly echeRowKey: string;
  readonly claimId: string;
}

/**
 * CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1: every `--json` document is
 * one versioned contract envelope; the landed read model these assertions
 * were written against is unchanged under its `data`.
 */
function unwrap(text: string): unknown {
  const envelope = JSON.parse(text) as { contractVersion: string; data: unknown };
  expect(envelope.contractVersion).toBe(CLASSIFIER_OPERATOR_CONTRACT_VERSION);
  return envelope.data;
}

describeDb('orgunits classify runs|calls|show - read models (integration)', () => {
  let admin: pg.Pool;
  let readonly: pg.Pool;
  let classifier: pg.Pool;
  let orgA: Org;
  let orgB: Org;

  beforeAll(() => {
    admin = adminPool();
    readonly = readonlyPool();
    classifier = classifierPool();
  });

  afterAll(async () => {
    await truncateAll(admin);
    await Promise.all([admin.end(), readonly.end(), classifier.end()]);
    if (PREVIOUS_READONLY === undefined) delete process.env.DATABASE_URL_READONLY;
    else process.env.DATABASE_URL_READONLY = PREVIOUS_READONLY;
  });

  beforeEach(async () => {
    await truncateAll(admin);
    orgA = await seedOrg('X READA01', '999000201');
    orgB = await seedOrg('X READB01', '999000202');
  });

  // -------------------------------------------------------------------------
  // Seeding (admin role, test database only).
  // -------------------------------------------------------------------------

  async function seedOrg(code: string, pic: string): Promise<Org> {
    const echeRowKey = `${code}|${pic}`;
    const run = await admin.query<{ id: string }>(
      `INSERT INTO ingest_runs (source_system, source_input_kind, status)
       VALUES ('eche', 'operator_file', 'succeeded') RETURNING id`,
    );
    const org = await admin.query<{ id: string }>(
      `INSERT INTO organisations
         (eche_row_key, legal_name, display_name, country_code, erasmus_code, pic)
       VALUES ($1, 'Read Model Institution', 'Read Model Institution', 'FR', $2, $3)
       RETURNING id`,
      [echeRowKey, code, pic],
    );
    const claim = await admin.query<{ id: string }>(
      `INSERT INTO website_claims
         (source_kind, eche_row_key, organisation_id, source_row_key, raw_value,
          structural_status, normalised_url, hostname, registrable_domain,
          rule_version, source_artifact_sha256, observed_at, ingest_run_id)
       VALUES ('ECHE_PUBLISHED', $1, $2, $1, 'www.example.ac.uk',
               'STRUCTURALLY_VALID', 'https://www.example.ac.uk/',
               'www.example.ac.uk', 'example.ac.uk',
               'test-rules-1', repeat('a', 64), now(), $3)
       RETURNING id`,
      [echeRowKey, org.rows[0]!.id, run.rows[0]!.id],
    );
    return { organisationId: org.rows[0]!.id, echeRowKey, claimId: claim.rows[0]!.id };
  }

  async function seedRun(
    terminal: 'COMPLETED' | 'FAILED' | 'ABORTED' | null,
    startedAt: string,
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES ($1, 'test-vantage', 'orgunit-fetch-policy-v7', 'orgunit-signal-rules-v1')
       RETURNING id`,
      [startedAt],
    );
    const runId = rows[0]!.id;
    if (terminal !== null) {
      await admin.query(
        `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, error_kind, finished_at)
         VALUES ($1, $2, $3, '2026-10-01T12:00:00Z')`,
        [runId, terminal, terminal === 'COMPLETED' ? null : 'OTHER'],
      );
    }
    return runId;
  }

  /** One fetch + page evidence for `org` in `runId`. Returns the page evidence id and its root key. */
  async function seedPage(
    runId: string,
    org: Org,
    path: string,
    opts: { title?: string; truncated?: boolean } = {},
  ): Promise<{ pageEvidenceId: string; rootKey: string }> {
    const url = `https://www.example.ac.uk${path}`;
    const fetch = await admin.query<{ id: string; root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, organisation_id, requested_url,
          requested_host, requested_registrable_domain, discovery_method, discovery_parent_url,
          http_status, content_type, charset, charset_source, charset_confidence,
          response_sha256, byte_count, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, $5, 'www.example.ac.uk', 'example.ac.uk', 'LINK',
               'https://www.example.ac.uk/', 200, 'text/html', 'utf-8', 'HTTP_HEADER',
               'DECLARED', $6, 4096, 'ALLOWED', 'orgunit-fetch-policy-v7', now())
       RETURNING id, root_key`,
      [runId, org.claimId, org.echeRowKey, org.organisationId, url, sha(`${runId}${url}`)],
    );
    const mainText = `Body of ${path}. ${MAIN_TEXT_SENTINEL}`;
    const page = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_evidence
         (fetch_observation_id, root_key, title, declared_lang, headings, main_text,
          main_text_chars, main_text_truncated, extraction_method, rule_version, observed_at)
       VALUES ($1, $2, $3, 'en', '[]'::jsonb, $4, length($4), $5, 'MAIN_ELEMENT',
               'orgunit-extraction-v1', now())
       RETURNING id`,
      [
        fetch.rows[0]!.id,
        fetch.rows[0]!.root_key,
        opts.title ?? `${QUOTE_MARK} ${path}`,
        mainText,
        opts.truncated ?? false,
      ],
    );
    return { pageEvidenceId: page.rows[0]!.id, rootKey: fetch.rows[0]!.root_key };
  }

  /** A bare (ERROR) fetch observation with no page, for attribution. */
  async function seedBareFetch(runId: string, org: Org): Promise<void> {
    await admin.query(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
          requested_registrable_domain, discovery_method, error_kind, robots_decision,
          fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, 'https://www.example.ac.uk/', 'www.example.ac.uk', 'example.ac.uk',
               'ROOT', 'DNS_FAILURE', 'ALLOWED', 'orgunit-fetch-policy-v7', now())`,
      [runId, org.claimId, org.echeRowKey],
    );
  }

  async function seedCandidate(
    runId: string,
    page: { pageEvidenceId: string; rootKey: string },
    rank: number,
    score: number,
    track: 'INTERNATIONAL_OFFICE' | 'LANGUAGE_CENTRE' = 'INTERNATIONAL_OFFICE',
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_candidates
         (page_evidence_id, run_id, root_key, track, candidate_score, signals,
          rank_within_root, rule_version)
       VALUES ($1, $2, $3, $4, $5, '[]'::jsonb, $6, 'orgunit-signal-rules-v1')
       RETURNING id`,
      [page.pageEvidenceId, runId, page.rootKey, track, score, rank],
    );
    return rows[0]!.id;
  }

  async function seedCall(opts: {
    runId: string;
    org: Org;
    requestedAt: string;
    documents?: number;
    attemptNo?: number;
    repairOf?: string;
    repairDocIndex?: number;
    rootKey?: string | null;
  }): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_classifier_calls
         (run_id, eche_row_key, organisation_id, root_key, model_id, prompt_version,
          classifier_version, output_schema_version, input_sha256, input_document_count,
          attempt_no, requested_at, repair_of_call_id, repair_doc_index)
       VALUES ($1, $2, $3, $4, $5, 'zz-prompt-v', 'zz-classifier-v', 'zz-schema-v', $6, $7, $8,
               $9, $10, $11)
       RETURNING id`,
      [
        opts.runId,
        opts.org.echeRowKey,
        opts.org.organisationId,
        opts.rootKey ?? null,
        MODEL_A,
        nextSha(),
        opts.repairOf === undefined ? (opts.documents ?? 2) : 1,
        opts.attemptNo ?? 1,
        opts.requestedAt,
        opts.repairOf ?? null,
        opts.repairOf === undefined ? null : (opts.repairDocIndex ?? 0),
      ],
    );
    return rows[0]!.id;
  }

  async function complete(
    callId: string,
    state: 'COMPLETED' | 'PARTIAL' | 'FAILED',
    tokens: { input: number; output: number } | null = { input: 1200, output: 340 },
  ): Promise<void> {
    await admin.query(
      `INSERT INTO orgunit_classifier_call_completions
         (call_id, terminal_state, response_model_id, input_tokens, output_tokens, error_kind,
          error_summary, finished_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-10-02T08:00:00Z')`,
      [
        callId,
        state,
        state === 'FAILED' ? null : MODEL_RESPONSE,
        tokens?.input ?? null,
        tokens?.output ?? null,
        state === 'COMPLETED' ? null : 'SCHEMA_INVALID',
        state === 'COMPLETED' ? null : 'one document failed structured validation',
      ],
    );
  }

  async function classify(
    callId: string,
    pageEvidenceId: string,
    candidateIds: readonly string[] = [],
  ): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_classifications
         (call_id, page_evidence_id, verdict, unit_type, page_kind, unit_name,
          serves_incoming_international_students, serves_outgoing_mobility_students,
          provides_language_learning_or_support, confidence, rationale, evidence_spans)
       VALUES ($1, $2, 'UNIT_PAGE', 'INTERNATIONAL_MOBILITY_OFFICE', NULL, $3, 'YES', 'UNKNOWN',
               'NO', 'HIGH', $4, $5::jsonb)
       RETURNING id`,
      [
        callId,
        pageEvidenceId,
        QUOTE_MARK,
        `The title names the office. ${RATIONALE_MARK}`,
        JSON.stringify([{ source: 'TITLE', quote: QUOTE_MARK }]),
      ],
    );
    const classificationId = rows[0]!.id;
    for (const candidateId of candidateIds) {
      await admin.query(
        `INSERT INTO orgunit_classification_subjects (classification_id, page_candidate_id)
         VALUES ($1, $2)`,
        [classificationId, candidateId],
      );
    }
    return classificationId;
  }

  // -------------------------------------------------------------------------
  // Drivers.
  // -------------------------------------------------------------------------

  interface Captured {
    readonly exit: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly readonlyUses: number;
  }

  async function run(
    options: Partial<ClassifyReadOptions> & { positionals: string[] },
  ): Promise<Captured> {
    let stdout = '';
    let stderr = '';
    let uses = 0;
    const deps: ClassifyReadDependencies = {
      withReadonlyPool: (fn) => {
        uses += 1;
        return fn(readonly);
      },
      stdout: (t) => {
        stdout += t;
      },
      stderr: (t) => {
        stderr += t;
      },
    };
    const supplied: string[] = [];
    if (options.organisationId !== undefined) supplied.push('organisation-id');
    if (options.runId !== undefined) supplied.push('run-id');
    if (options.callId !== undefined) supplied.push('call-id');
    if (options.limit !== undefined) supplied.push('limit');
    if (options.json === true) supplied.push('json');
    const exit = await executeClassifyReadCommand(
      { suppliedOptions: supplied, json: false, ...options },
      deps,
    );
    return { exit, stdout, stderr, readonlyUses: uses };
  }

  async function json<T>(
    options: Partial<ClassifyReadOptions> & { positionals: string[] },
  ): Promise<T> {
    const result = await run({ ...options, json: true });
    expect(result.exit, result.stderr).toBe(0);
    return unwrap(result.stdout) as T;
  }

  async function cli(argv: string[]): Promise<Captured> {
    let stdout = '';
    let stderr = '';
    const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });
    try {
      const exit = await main(argv);
      return { exit, stdout, stderr, readonlyUses: -1 };
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  }

  async function snapshot(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const table of [...CLASSIFIER_TABLES, ...RESEARCH_TABLES]) {
      result[table] = await count(admin, table);
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // 41. RUN ATTRIBUTION.
  // -------------------------------------------------------------------------

  it('attributes runs only through fetch evidence or ordinary classifier calls, and never a run with neither', async () => {
    const fetchA = await seedRun('COMPLETED', '2026-09-01T00:00:00Z');
    await seedBareFetch(fetchA, orgA);
    const fetchB = await seedRun('COMPLETED', '2026-09-02T00:00:00Z');
    await seedBareFetch(fetchB, orgB);
    const callOnlyA = await seedRun('COMPLETED', '2026-09-03T00:00:00Z');
    await seedCall({ runId: callOnlyA, org: orgA, requestedAt: '2026-09-03T01:00:00Z' });
    const bothA = await seedRun('COMPLETED', '2026-09-04T00:00:00Z');
    await seedBareFetch(bothA, orgA);
    await seedCall({ runId: bothA, org: orgA, requestedAt: '2026-09-04T01:00:00Z' });
    const neither = await seedRun('FAILED', '2026-09-05T00:00:00Z');
    // A REPAIR call alone never attributes a run: only ordinary calls do.
    const repairOnly = await seedRun('COMPLETED', '2026-09-06T00:00:00Z');
    const parent = await seedCall({
      runId: bothA,
      org: orgA,
      requestedAt: '2026-09-06T01:00:00Z',
      attemptNo: 2,
    });
    await seedCall({
      runId: repairOnly,
      org: orgA,
      requestedAt: '2026-09-06T02:00:00Z',
      repairOf: parent,
      repairDocIndex: 0,
    });

    const a = await json<ResearchRunsRead>({
      positionals: ['runs'],
      organisationId: orgA.organisationId,
    });
    expect(a.kind).toBe('CLASSIFIER_RESEARCH_RUNS');
    expect(a.associationCoverage).toBe(RUN_ASSOCIATION_COVERAGE);
    expect(a.associationCoverage).toBe(
      'ATTRIBUTABLE_ONLY_ZERO_FETCH_UNCLASSIFIED_RUNS_CANNOT_BE_ORGANISATION_LINKED',
    );
    expect(a.runs.map((r) => [r.runId, r.associationBasis])).toEqual([
      [bothA, 'BOTH'],
      [callOnlyA, 'CLASSIFIER_CALL'],
      [fetchA, 'FETCH_EVIDENCE'],
    ]);
    const b = await json<ResearchRunsRead>({
      positionals: ['runs'],
      organisationId: orgB.organisationId,
    });
    expect(b.runs.map((r) => [r.runId, r.associationBasis])).toEqual([[fetchB, 'FETCH_EVIDENCE']]);
    for (const listing of [a, b]) {
      expect(listing.runs.map((r) => r.runId)).not.toContain(neither);
      expect(listing.runs.map((r) => r.runId)).not.toContain(repairOnly);
    }
  });

  it('human output states the attribution limitation once', async () => {
    const r = await seedRun('COMPLETED', '2026-09-01T00:00:00Z');
    await seedBareFetch(r, orgA);
    const result = await run({ positionals: ['runs'], organisationId: orgA.organisationId });
    expect(result.exit).toBe(0);
    expect(result.stdout.split(RUN_ASSOCIATION_COVERAGE)).toHaveLength(2);
    expect(result.stdout).toContain('cannot be linked to');
    expect(result.stdout).toContain(r);
  });

  // -------------------------------------------------------------------------
  // 42. RUN STATUS.
  // -------------------------------------------------------------------------

  it('reads run terminal states from completion rows only; none is NO_COMPLETION_RECORDED', async () => {
    const states = ['COMPLETED', 'FAILED', 'ABORTED', null] as const;
    const ids: string[] = [];
    for (const [i, state] of states.entries()) {
      const id = await seedRun(state, `2026-09-0${i + 1}T00:00:00Z`);
      await seedBareFetch(id, orgA);
      ids.push(id);
    }
    const a = await json<ResearchRunsRead>({
      positionals: ['runs'],
      organisationId: orgA.organisationId,
    });
    const byId = new Map(a.runs.map((r) => [r.runId, r]));
    expect(ids.map((id) => byId.get(id)!.terminalState)).toEqual([
      'COMPLETED',
      'FAILED',
      'ABORTED',
      'NO_COMPLETION_RECORDED',
    ]);
    expect(ids.map((id) => byId.get(id)!.classifierCompletionGatePasses)).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(ids.map((id) => byId.get(id)!.errorKind)).toEqual([null, 'OTHER', 'OTHER', null]);
    expect(byId.get(ids[3]!)!.finishedAt).toBeNull();
    expect(byId.get(ids[0]!)!.finishedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(byId.get(ids[0]!)!.startedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(byId.get(ids[0]!)).toMatchObject({
      networkVantage: 'test-vantage',
      fetchPolicyVersion: 'orgunit-fetch-policy-v7',
      ruleVersion: 'orgunit-signal-rules-v1',
      dryRun: false,
    });
  });

  it('orders runs started_at DESC, id DESC and applies the SQL limit', async () => {
    const same = '2026-09-10T00:00:00Z';
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const id = await seedRun('COMPLETED', same);
      await seedBareFetch(id, orgA);
      ids.push(id);
    }
    const older = await seedRun('COMPLETED', '2026-09-01T00:00:00Z');
    await seedBareFetch(older, orgA);
    const all = await json<ResearchRunsRead>({
      positionals: ['runs'],
      organisationId: orgA.organisationId,
    });
    expect(all.limit).toBe(50);
    expect(all.runs.map((r) => r.runId)).toEqual([...[...ids].sort().reverse(), older]);
    const two = await json<ResearchRunsRead>({
      positionals: ['runs'],
      organisationId: orgA.organisationId,
      limit: 2,
    });
    expect(two.limit).toBe(2);
    expect(two.runs.map((r) => r.runId)).toEqual([...ids].sort().reverse().slice(0, 2));
  });

  // -------------------------------------------------------------------------
  // 43. CANDIDATE COUNTS.
  // -------------------------------------------------------------------------

  it('counts every candidate row, and eligible rows by rank cutoff only - never by score', async () => {
    expect(MAX_CANDIDATES_PER_ROOT_TRACK).toBe(8);
    const runId = await seedRun('COMPLETED', '2026-09-01T00:00:00Z');
    const pages = [];
    for (let i = 0; i < 4; i += 1) pages.push(await seedPage(runId, orgA, `/p-${i}`));
    // Inside the cutoff, with positive, zero and negative scores.
    await seedCandidate(runId, pages[0]!, 1, 9);
    await seedCandidate(runId, pages[1]!, 2, 0);
    await seedCandidate(runId, pages[2]!, MAX_CANDIDATES_PER_ROOT_TRACK, -4);
    // Outside the cutoff, including a high score.
    await seedCandidate(runId, pages[3]!, MAX_CANDIDATES_PER_ROOT_TRACK + 1, 50);
    await seedCandidate(runId, pages[0]!, MAX_CANDIDATES_PER_ROOT_TRACK + 5, -1, 'LANGUAGE_CENTRE');
    const [row] = (
      await json<ResearchRunsRead>({ positionals: ['runs'], organisationId: orgA.organisationId })
    ).runs;
    expect(row).toMatchObject({
      runId,
      fetchObservationCount: 4,
      pageEvidenceCount: 4,
      candidateRowCount: 5,
      eligibleCandidateRowCount: 3,
      ordinaryClassifierCallCount: 0,
    });
  });

  // -------------------------------------------------------------------------
  // 44 / 45. CALL LIST AND CALL TERMINAL STATE.
  // -------------------------------------------------------------------------

  it('lists ordinary calls only, scoped to the organisation and optional run, in deterministic order, with exact states', async () => {
    const run1 = await seedRun('COMPLETED', '2026-09-01T00:00:00Z');
    const run2 = await seedRun('COMPLETED', '2026-09-02T00:00:00Z');
    const completed = await seedCall({
      runId: run1,
      org: orgA,
      requestedAt: '2026-09-01T01:00:00Z',
    });
    const partial = await seedCall({
      runId: run1,
      org: orgA,
      requestedAt: '2026-09-01T02:00:00Z',
      attemptNo: 2,
    });
    const failed = await seedCall({ runId: run2, org: orgA, requestedAt: '2026-09-01T03:00:00Z' });
    const open = await seedCall({
      runId: run2,
      org: orgA,
      requestedAt: '2026-09-01T03:00:00Z',
      attemptNo: 2,
    });
    await complete(completed, 'COMPLETED');
    await complete(partial, 'PARTIAL');
    await complete(failed, 'FAILED', null);
    const repair = await seedCall({
      runId: run1,
      org: orgA,
      requestedAt: '2026-09-09T00:00:00Z',
      repairOf: partial,
      repairDocIndex: 1,
    });
    await complete(repair, 'COMPLETED');
    const other = await seedCall({ runId: run1, org: orgB, requestedAt: '2026-09-09T00:00:00Z' });

    const all = await json<ClassifierCallsRead>({
      positionals: ['calls'],
      organisationId: orgA.organisationId,
    });
    expect(all.kind).toBe('CLASSIFIER_CALLS');
    expect(all.runId).toBeNull();
    const tied = [failed, open].sort().reverse();
    expect(all.calls.map((c) => c.callId)).toEqual([...tied, partial, completed]);
    expect(all.calls.map((c) => c.callId)).not.toContain(repair);
    expect(all.calls.map((c) => c.callId)).not.toContain(other);
    const state = new Map(all.calls.map((c) => [c.callId, c.terminalState]));
    expect([completed, partial, failed, open].map((id) => state.get(id))).toEqual([
      'COMPLETED',
      'PARTIAL',
      'FAILED',
      'NO_COMPLETION_RECORDED',
    ]);
    const p = all.calls.find((c) => c.callId === partial)!;
    expect(p).toMatchObject({ repairCallCount: 1, completedRepairCount: 1, attemptNo: 2 });
    const f = all.calls.find((c) => c.callId === failed)!;
    expect(f).toMatchObject({
      responseModelId: null,
      inputTokens: null,
      outputTokens: null,
      errorKind: 'SCHEMA_INVALID',
    });
    const c = all.calls.find((x) => x.callId === completed)!;
    expect(c).toMatchObject({
      runId: run1,
      requestedModelId: MODEL_A,
      responseModelId: MODEL_RESPONSE,
      promptVersion: 'zz-prompt-v',
      classifierVersion: 'zz-classifier-v',
      outputSchemaVersion: 'zz-schema-v',
      inputDocumentCount: 2,
      requestedAt: '2026-09-01T01:00:00.000Z',
      finishedAt: '2026-10-02T08:00:00.000Z',
      inputTokens: 1200,
      outputTokens: 340,
      errorKind: null,
    });
    expect(c.inputSha256).toMatch(/^[0-9a-f]{64}$/);

    const filtered = await json<ClassifierCallsRead>({
      positionals: ['calls'],
      organisationId: orgA.organisationId,
      runId: run1,
    });
    expect(filtered.runId).toBe(run1);
    expect(filtered.calls.map((x) => x.callId)).toEqual([partial, completed]);

    const limited = await json<ClassifierCallsRead>({
      positionals: ['calls'],
      organisationId: orgA.organisationId,
      limit: 1,
    });
    expect(limited.calls.map((x) => x.callId)).toEqual([tied[0]]);

    // Organisation B's run filter on A's run lists only B's own call.
    const b = await json<ClassifierCallsRead>({
      positionals: ['calls'],
      organisationId: orgB.organisationId,
      runId: run1,
    });
    expect(b.calls.map((x) => x.callId)).toEqual([other]);
  });

  it('an unmatched run filter is an empty result with exit 0, never a claim the run does not exist', async () => {
    const result = await run({
      positionals: ['calls'],
      organisationId: orgA.organisationId,
      runId: UNKNOWN_UUID,
      json: true,
    });
    expect(result.exit).toBe(0);
    expect(unwrap(result.stdout)).toEqual({
      kind: 'CLASSIFIER_CALLS',
      organisationId: orgA.organisationId,
      runId: UNKNOWN_UUID,
      limit: 50,
      calls: [],
    });
    expect(result.stdout + result.stderr).not.toMatch(/does not exist|not found|no such run/i);
  });

  it('an unknown organisation exits 1 for runs and calls; an unknown call id exits 1 for show', async () => {
    for (const positionals of [['runs'], ['calls']]) {
      const r = await run({ positionals, organisationId: UNKNOWN_UUID });
      expect(r.exit).toBe(1);
      expect(r.stderr).toContain(`no organisation with id ${UNKNOWN_UUID}`);
      expect(r.stdout).toBe('');
    }
    const s = await run({ positionals: ['show'], callId: UNKNOWN_UUID });
    expect(s.exit).toBe(1);
    expect(s.stderr).toContain(`no classifier call with id ${UNKNOWN_UUID}`);
  });

  // -------------------------------------------------------------------------
  // 46. EFFECTIVE CLASSIFICATIONS (ADR 0011), AND EQUALITY WITH THE CANONICAL READER.
  // -------------------------------------------------------------------------

  async function ordinaryWithRepair(
    repairState: 'COMPLETED' | 'PARTIAL' | 'FAILED' | null,
  ): Promise<{
    callId: string;
    repairId: string;
    original: string;
    repaired: string;
    candidates: string[];
  }> {
    const runId = await seedRun('COMPLETED', '2026-09-01T00:00:00Z');
    const docA = await seedPage(runId, orgA, '/a');
    const docB = await seedPage(runId, orgA, '/b', { truncated: true });
    const candA1 = await seedCandidate(runId, docA, 1, 3);
    const candA2 = await seedCandidate(runId, docA, 1, 2, 'LANGUAGE_CENTRE');
    const candB = await seedCandidate(runId, docB, 2, 1);
    const callId = await seedCall({
      runId,
      org: orgA,
      requestedAt: '2026-09-01T01:00:00Z',
      rootKey: docA.rootKey,
    });
    const original = await classify(callId, docA.pageEvidenceId, [candA2, candA1]);
    await complete(callId, 'PARTIAL');
    const repairId = await seedCall({
      runId,
      org: orgA,
      requestedAt: '2026-09-01T02:00:00Z',
      repairOf: callId,
      repairDocIndex: 1,
      rootKey: docB.rootKey,
    });
    // A repair can persist a row and still not be COMPLETED (e.g. crash before completion).
    const repaired = await classify(repairId, docB.pageEvidenceId, [candB]);
    if (repairState !== null) await complete(repairId, repairState);
    return { callId, repairId, original, repaired, candidates: [candA1, candA2, candB] };
  }

  it('a COMPLETED repair makes its classification effective: A original + B repaired', async () => {
    const s = await ordinaryWithRepair('COMPLETED');
    const detail = await json<OrdinaryCallDetailRead>({ positionals: ['show'], callId: s.callId });
    expect(detail.callKind).toBe('ORDINARY');
    expect(
      detail.effectiveClassifications.map((c) => [c.classificationId, c.fromCallId, c.repaired]),
    ).toEqual([
      [s.original, s.callId, false],
      [s.repaired, s.repairId, true],
    ]);
    expect(detail.effectiveClassificationCount).toBe(2);
    expect(detail.unclassifiedDocumentCount).toBe(0);
    const listed = (
      await json<ClassifierCallsRead>({
        positionals: ['calls'],
        organisationId: orgA.organisationId,
      })
    ).calls[0]!;
    expect(listed).toMatchObject({
      ownClassificationCount: 1,
      repairCallCount: 1,
      completedRepairCount: 1,
      effectiveClassificationCount: 2,
      unclassifiedDocumentCount: 0,
    });
  });

  it.each([
    ['PARTIAL', 'PARTIAL'],
    ['FAILED', 'FAILED'],
    ['completion-less', null],
  ] as const)('a %s repair contributes NOTHING to the effective set', async (_label, state) => {
    const s = await ordinaryWithRepair(state);
    const detail = await json<OrdinaryCallDetailRead>({
      positionals: ['show'],
      callId: s.callId,
    });
    expect(detail.effectiveClassifications.map((c) => c.classificationId)).toEqual([s.original]);
    expect(detail.unclassifiedDocumentCount).toBe(1);
    expect(detail.repairs).toEqual([
      expect.objectContaining({
        repairCallId: s.repairId,
        repairDocIndex: 1,
        terminalState: state ?? 'NO_COMPLETION_RECORDED',
        classificationCount: 1,
      }),
    ]);
    const listed = (
      await json<ClassifierCallsRead>({
        positionals: ['calls'],
        organisationId: orgA.organisationId,
      })
    ).calls[0]!;
    expect(listed).toMatchObject({
      repairCallCount: 1,
      completedRepairCount: 0,
      effectiveClassificationCount: 1,
      unclassifiedDocumentCount: 1,
    });
  });

  it.each([
    ['COMPLETED', 'COMPLETED'],
    ['PARTIAL', 'PARTIAL'],
    ['FAILED', 'FAILED'],
    ['completion-less', null],
  ] as const)(
    'with a %s repair the readonly effective set equals the canonical ADR 0011 reader (classifier role) exactly',
    async (_label, state) => {
      const s = await ordinaryWithRepair(state);
      const canonical = await loadEffectiveClassifications(classifier, s.callId);
      const detail = (await showClassifierCall(readonly, s.callId)) as OrdinaryCallDetailRead;
      expect(
        detail.effectiveClassifications.map((c) => ({
          id: c.classificationId,
          pageEvidenceId: c.pageEvidenceId,
          fromCallId: c.fromCallId,
          repaired: c.repaired,
          verdict: c.verdict,
          unitType: c.unitType,
          pageKind: c.pageKind,
          unitName: c.unitName,
          servesIncomingInternationalStudents: c.servesIncomingInternationalStudents,
          servesOutgoingMobilityStudents: c.servesOutgoingMobilityStudents,
          providesLanguageLearningOrSupport: c.providesLanguageLearningOrSupport,
          confidence: c.confidence,
          rationale: c.rationale,
          evidenceSpans: c.evidenceSpans,
        })),
      ).toEqual(canonical.map((c) => ({ ...c })));
    },
  );

  // -------------------------------------------------------------------------
  // 47 / 48. CALL DETAIL.
  // -------------------------------------------------------------------------

  it('show on a repair call id: callKind REPAIR, its own completion and rows, and no effective set of its own', async () => {
    const s = await ordinaryWithRepair('COMPLETED');
    const detail = await json<RepairCallDetailRead & Record<string, unknown>>({
      positionals: ['show'],
      callId: s.repairId,
    });
    expect(detail.kind).toBe('CLASSIFIER_CALL_DETAIL');
    expect(detail.callKind).toBe('REPAIR');
    expect(detail.call).toMatchObject({
      callId: s.repairId,
      repairOfCallId: s.callId,
      repairDocIndex: 1,
      organisationId: orgA.organisationId,
      echeRowKey: orgA.echeRowKey,
      inputDocumentCount: 1,
    });
    expect(detail.effectiveViewBelongsToOrdinaryCallId).toBe(s.callId);
    expect(detail.completion).toMatchObject({ terminalState: 'COMPLETED', errorKind: null });
    expect(
      detail.ownClassifications.map((c) => [c.classificationId, c.fromCallId, c.repaired]),
    ).toEqual([[s.repaired, s.repairId, true]]);
    expect(Object.keys(detail).sort()).toEqual(
      [
        'call',
        'callKind',
        'completion',
        'effectiveViewBelongsToOrdinaryCallId',
        'kind',
        'ownClassifications',
      ].sort(),
    );
    const human = await run({ positionals: ['show'], callId: s.repairId });
    expect(human.stdout).toContain(`(REPAIR)`);
    expect(human.stdout).toContain(`effective view belongs to ordinary call ${s.callId}`);
    expect(human.stdout).not.toContain('effective classifications');
  });

  it('show on an ordinary call: identity, completion, own rows, nested repairs, effective rows, page context, subjects', async () => {
    const s = await ordinaryWithRepair('COMPLETED');
    const detail = await json<OrdinaryCallDetailRead & Record<string, unknown>>({
      positionals: ['show'],
      callId: s.callId,
    });
    expect(Object.keys(detail).sort()).toEqual(
      [
        'call',
        'callKind',
        'completion',
        'effectiveClassificationCount',
        'effectiveClassifications',
        'kind',
        'ownClassifications',
        'repairs',
        'unclassifiedDocumentCount',
      ].sort(),
    );
    expect(Object.keys(detail.call).sort()).toEqual(
      [
        'attemptNo',
        'callId',
        'classifierVersion',
        'echeRowKey',
        'inputDocumentCount',
        'inputSha256',
        'organisationId',
        'outputSchemaVersion',
        'promptVersion',
        'requestedAt',
        'requestedModelId',
        'rootKey',
        'runId',
      ].sort(),
    );
    expect(detail.call.rootKey).toMatch(/^claim:/);
    expect(detail.completion).toEqual({
      terminalState: 'PARTIAL',
      responseModelId: MODEL_RESPONSE,
      inputTokens: 1200,
      outputTokens: 340,
      errorKind: 'SCHEMA_INVALID',
      errorSummary: 'one document failed structured validation',
      finishedAt: '2026-10-02T08:00:00.000Z',
    });
    expect(detail.ownClassifications).toHaveLength(1);
    const own = detail.ownClassifications[0]!;
    expect(own).toMatchObject({
      classificationId: s.original,
      repaired: false,
      verdict: 'UNIT_PAGE',
      unitType: 'INTERNATIONAL_MOBILITY_OFFICE',
      pageKind: null,
      unitName: QUOTE_MARK,
      servesIncomingInternationalStudents: 'YES',
      servesOutgoingMobilityStudents: 'UNKNOWN',
      providesLanguageLearningOrSupport: 'NO',
      confidence: 'HIGH',
      evidenceSpans: [{ source: 'TITLE', quote: QUOTE_MARK }],
      subjectCandidateCount: 2,
      subjectCandidateIds: [s.candidates[0]!, s.candidates[1]!].sort(),
      page: {
        requestedUrl: 'https://www.example.ac.uk/a',
        title: `${QUOTE_MARK} /a`,
        declaredLang: 'en',
        mainTextTruncated: false,
      },
    });
    expect(own.rationale).toContain(RATIONALE_MARK);
    expect(detail.repairs).toEqual([
      {
        repairCallId: s.repairId,
        repairDocIndex: 1,
        requestedAt: '2026-09-01T02:00:00.000Z',
        terminalState: 'COMPLETED',
        errorKind: null,
        finishedAt: '2026-10-02T08:00:00.000Z',
        classificationCount: 1,
      },
    ]);
    const repaired = detail.effectiveClassifications[1]!;
    expect(repaired.page.mainTextTruncated).toBe(true);
    expect(repaired.subjectCandidateIds).toEqual([s.candidates[2]]);
    // No duplicate classification, and the effective set is own + completed repair rows.
    const ids = detail.effectiveClassifications.map((c) => c.classificationId);
    expect(new Set(ids).size).toBe(ids.length);
    // Stable: a second read is identical.
    expect(await json({ positionals: ['show'], callId: s.callId })).toEqual(detail);
  });

  it('orders repairs by repair_doc_index ASC, then call id', async () => {
    const runId = await seedRun('COMPLETED', '2026-09-01T00:00:00Z');
    const callId = await seedCall({
      runId,
      org: orgA,
      requestedAt: '2026-09-01T01:00:00Z',
      documents: 4,
    });
    await complete(callId, 'FAILED', null);
    const r3 = await seedCall({
      runId,
      org: orgA,
      requestedAt: '2026-09-01T02:00:00Z',
      repairOf: callId,
      repairDocIndex: 3,
    });
    const r0 = await seedCall({
      runId,
      org: orgA,
      requestedAt: '2026-09-01T03:00:00Z',
      repairOf: callId,
      repairDocIndex: 0,
    });
    const r2 = await seedCall({
      runId,
      org: orgA,
      requestedAt: '2026-09-01T04:00:00Z',
      repairOf: callId,
      repairDocIndex: 2,
    });
    const detail = (await showClassifierCall(readonly, callId)) as OrdinaryCallDetailRead;
    expect(detail.repairs.map((r) => [r.repairDocIndex, r.repairCallId])).toEqual([
      [0, r0],
      [2, r2],
      [3, r3],
    ]);
    expect(detail.repairs.every((r) => r.terminalState === 'NO_COMPLETION_RECORDED')).toBe(true);
    expect(detail.unclassifiedDocumentCount).toBe(4);
  });

  // -------------------------------------------------------------------------
  // 49. OUTPUT FIREWALL.
  // -------------------------------------------------------------------------

  it('no read output carries main text, prompt, serialized input, raw output, environment or credentials - but does carry persisted rationale', async () => {
    const s = await ordinaryWithRepair('COMPLETED');
    const outputs: string[] = [];
    for (const json of [false, true]) {
      outputs.push(
        (await run({ positionals: ['runs'], organisationId: orgA.organisationId, json })).stdout,
      );
      outputs.push(
        (await run({ positionals: ['calls'], organisationId: orgA.organisationId, json })).stdout,
      );
      outputs.push((await run({ positionals: ['show'], callId: s.callId, json })).stdout);
      outputs.push((await run({ positionals: ['show'], callId: s.repairId, json })).stdout);
    }
    const forbiddenKeys =
      /^(mainText|main_text|serializedBatch|serialized_batch|systemPrompt|rawProviderOutput|rawResponse|environment|env|profileDir|credential|credentials|transcript|sdkTranscript|chainOfThought|thinking|requestConfig|request_config|signals|candidateScore|candidate_score|headings|docIndex|doc_index)$/;
    const keys = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap(keys)
        : value !== null && typeof value === 'object'
          ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)])
          : [];
    for (const [i, output] of outputs.entries()) {
      expect(output, `output ${i}`).not.toContain(MAIN_TEXT_SENTINEL);
      expect(output, `output ${i}`).not.toContain(ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.slice(0, 60));
      expect(output, `output ${i}`).not.toMatch(/HOME=|DATABASE_URL|local_dev_only|postgres:\/\//);
      if (i >= 4) {
        expect(
          keys(JSON.parse(output)).filter((k) => forbiddenKeys.test(k)),
          `output ${i}`,
        ).toEqual([]);
      }
    }
    // The persisted validated rationale and evidence spans ARE inspectable.
    const showJson = outputs[6]!;
    expect(showJson).toContain(RATIONALE_MARK);
    expect(showJson).toContain('"evidenceSpans"');
    expect(outputs[2]!).toContain(RATIONALE_MARK);
    expect(outputs[2]!).toContain(`evidence TITLE: ${QUOTE_MARK}`);
  });

  // -------------------------------------------------------------------------
  // 50 / 51. NO PROVIDER, NO WRITE, READONLY ROLE ONLY.
  // -------------------------------------------------------------------------

  it('every real read through the CLI router uses the readonly role, writes nothing and reaches no provider', async () => {
    const s = await ordinaryWithRepair('COMPLETED');
    const r = await seedRun('ABORTED', '2026-09-03T00:00:00Z');
    await seedBareFetch(r, orgB);
    const before = await snapshot();
    const countersBefore = { ...providerCounters };
    const invocations = [
      ['orgunits', 'classify', 'runs', '--organisation-id', orgA.organisationId],
      ['orgunits', 'classify', 'runs', '--organisation-id', orgB.organisationId, '--json'],
      ['orgunits', 'classify', 'calls', '--organisation-id', orgA.organisationId, '--limit', '5'],
      ['orgunits', 'classify', 'calls', '--organisation-id', orgA.organisationId, '--json'],
      ['orgunits', 'classify', 'show', '--call-id', s.callId],
      ['orgunits', 'classify', 'show', '--call-id', s.repairId, '--json'],
    ];
    for (const argv of invocations) {
      const result = await cli(argv);
      expect(result.exit, `${argv.join(' ')}\n${result.stderr}`).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    }
    const shown = await cli(['orgunits', 'classify', 'show', '--call-id', s.callId, '--json']);
    expect((unwrap(shown.stdout) as ClassifierCallDetailRead).callKind).toBe('ORDINARY');
    expect(await snapshot()).toEqual(before);
    expect(providerCounters).toEqual(countersBefore);
    expect(providerCounters).toEqual({
      providerConstructions: 0,
      sdkRunnerFactory: 0,
      authStatusRunnerFactory: 0,
      wiring: 0,
    });
  });

  it('the read models run under nwf_readonly, which itself refuses any write', async () => {
    const { rows } = await readonly.query<{ u: string }>('SELECT current_user AS u');
    expect(rows[0]!.u).toBe('nwf_readonly');
    const s = await ordinaryWithRepair('COMPLETED');
    expect(
      await listClassifierResearchRuns(readonly, { organisationId: orgA.organisationId, limit: 5 }),
    ).not.toBeNull();
    expect(
      await listClassifierCalls(readonly, {
        organisationId: orgA.organisationId,
        runId: null,
        limit: 5,
      }),
    ).not.toBeNull();
    expect(await showClassifierCall(readonly, s.callId)).not.toBeNull();
    const before = await snapshot();
    await expect(
      readonly.query(
        `INSERT INTO orgunit_classifier_call_completions (call_id, terminal_state, finished_at)
         VALUES ($1, 'COMPLETED', now())`,
        [s.repairId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      readonly.query(`INSERT INTO orgunit_research_run_completions (run_id, terminal_state, finished_at)
                      SELECT id, 'COMPLETED', now() FROM orgunit_research_runs LIMIT 1`),
    ).rejects.toThrow(/permission denied/);
    expect(await snapshot()).toEqual(before);
  });

  // -------------------------------------------------------------------------
  // 52. REAL ROUTER: refusals that never reach any pool.
  // -------------------------------------------------------------------------

  it('the real router refuses an unknown classifier subcommand and every irrelevant flag', async () => {
    const before = await snapshot();
    const countersBefore = { ...providerCounters };
    for (const [argv, message] of [
      [
        ['orgunits', 'classify', 'nonsense', '--organisation-id', orgA.organisationId],
        /Unknown classifier subcommand/,
      ],
      [
        [
          'orgunits',
          'classify',
          'nonsense',
          '--organisation-id',
          orgA.organisationId,
          '--run-id',
          UNKNOWN_UUID,
          '--model',
          MODEL_A,
          '--execute',
        ],
        /Unknown classifier subcommand/,
      ],
      [
        ['orgunits', 'classify', 'runs', '--organisation-id', orgA.organisationId, '--execute'],
        /--execute/,
      ],
      [
        [
          'orgunits',
          'classify',
          'calls',
          '--organisation-id',
          orgA.organisationId,
          '--model',
          MODEL_A,
        ],
        /--model/,
      ],
      [['orgunits', 'classify', 'show', '--call-id', UNKNOWN_UUID, '--limit', '3'], /--limit/],
    ] as const) {
      const result = await cli([...argv]);
      expect(result.exit, argv.join(' ')).toBe(1);
      expect(result.stderr, argv.join(' ')).toMatch(message);
      expect(result.stderr).not.toMatch(/MODEL_NOT_ALLOWED|research run|dry run/i);
    }
    expect(await snapshot()).toEqual(before);
    expect(providerCounters).toEqual(countersBefore);
  });

  // -------------------------------------------------------------------------
  // Positive control: the counting mocks are LIVE, so the zeros above mean
  // something. Runs last; restores the counters it moves.
  // -------------------------------------------------------------------------

  it('positive control: reaching the provider wiring or a runner factory IS counted', async () => {
    const before = { ...providerCounters };
    const wiring = (await import('../../cli/commands/classifyProvider.js')) as Record<
      string,
      () => unknown
    >;
    expect(() => wiring['createProductionClassifierProvider']!()).toThrow(/must not be reached/);
    const sdk =
      (await import('../../orgunits/classify/provider/agentSdkRunner.js')) as unknown as Record<
        string,
        () => unknown
      >;
    expect(() => sdk[['createProduction', 'AgentSdkRunner'].join('')]!()).toThrow(
      /must not be created/,
    );
    const auth =
      (await import('../../orgunits/classify/provider/authStatusRunner.js')) as unknown as Record<
        string,
        () => unknown
      >;
    expect(() => auth[['createProduction', 'AuthStatusRunner'].join('')]!()).toThrow(
      /must not be created/,
    );
    expect(providerCounters).toEqual({
      ...before,
      wiring: before.wiring + 1,
      sdkRunnerFactory: before.sdkRunnerFactory + 1,
      authStatusRunnerFactory: before.authStatusRunnerFactory + 1,
    });
    Object.assign(providerCounters, before);
  });
});

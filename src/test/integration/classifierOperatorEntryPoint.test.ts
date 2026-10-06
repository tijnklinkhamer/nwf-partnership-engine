/**
 * CLASSIFIER_OPERATOR_ENTRY_POINT_V1 — `nwf-pe orgunits classify`, AGAINST
 * REAL POSTGRESQL (`nwf_pe_test`), through the ACTUAL `nwf_research` and
 * `nwf_classifier` roles.
 *
 * NO REAL PROVIDER, EVER. Every execution test drives the tested core
 * (`executeClassifyCommand`) with an explicit `createProvider` that returns
 * a `ScriptedTestProvider` and counts how often it was asked. The REAL CLI
 * router (`src/cli/index.ts`'s `main`) is driven only on paths that refuse
 * or stay dry BEFORE any provider could be constructed. No institution is
 * contacted: classification reads persisted page evidence only.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';

import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  count,
  researchDatabaseConfigured,
  researchPool,
  seedOrgunitRoot,
  truncateAll,
  type OrgunitRootFixture,
} from './helpers.js';
import {
  executeClassifyCommand,
  type ClassifyDependencies,
  type ClassifyOptions,
} from '../../cli/commands/classify.js';
import { planOrganisationClassification } from '../../orgunits/classify/operatorPlan.js';
import { insertClassifierCall, insertCompletion } from '../../orgunits/classify/persist.js';
import { ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION } from '../../orgunits/classify/constants.js';
import { ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION } from '../../orgunits/classify/outputSchema.js';
import {
  ORGUNIT_CLASSIFIER_PROMPT_VERSION,
  ORGUNIT_CLASSIFIER_SYSTEM_PROMPT,
} from '../../orgunits/classify/prompt.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import { FORBIDDEN_AUTH_VARIABLES } from '../../orgunits/classify/provider/authConflicts.js';
import type {
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../../orgunits/classify/providerContract.js';
import {
  ScriptedTestProvider,
  scriptedOk,
  scriptedRefusal,
  type ScriptedResponder,
} from '../../orgunits/classify/scriptedProvider.js';

// MUST run before anything calls `config/env.ts`'s `env()` (the
// `describeDb` gate just below is the first call; imports never call it): points the PRODUCTION role
// variables the real CLI router reads at the TEST database, exactly as
// `orgunitDiscoverCli.test.ts` does for the research role.
const PREVIOUS = {
  research: process.env.DATABASE_URL_RESEARCH,
  classifier: process.env.DATABASE_URL_CLASSIFIER,
};
if (process.env.DATABASE_URL_RESEARCH_TEST) {
  process.env.DATABASE_URL_RESEARCH = process.env.DATABASE_URL_RESEARCH_TEST;
}
if (process.env.DATABASE_URL_CLASSIFIER_TEST) {
  process.env.DATABASE_URL_CLASSIFIER = process.env.DATABASE_URL_CLASSIFIER_TEST;
}

const configured = classifierDatabaseConfigured() && researchDatabaseConfigured();
const describeDb = configured ? describe : describe.skip;

/** The model id is read from the closed allowlist, never spelled here; no member is privileged. */
const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
const CLASSIFIER_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];
/** Text that must never reach operator output. */
const MAIN_TEXT_SENTINEL = 'zz-main-text-sentinel-never-printed';
const RATIONALE_SENTINEL = 'zz-model-rationale-sentinel-never-printed';
const ENV_SENTINEL = 'zz-environment-value-sentinel-never-printed';
const HOME_SENTINEL = '/zz-home-sentinel-never-printed';

function sha(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

/** A clean, conflict-free environment: the pure preflight passes on it, and it carries sentinels. */
const CLEAN_ENV: Readonly<Record<string, string>> = Object.freeze({
  HOME: HOME_SENTINEL,
  NWF_PE_OPERATOR_TEST_SENTINEL: ENV_SENTINEL,
});

interface Harness {
  readonly deps: ClassifyDependencies;
  readonly providerCreations: () => number;
  readonly provider: () => ScriptedTestProvider | null;
  readonly researchUses: () => number;
  readonly classifierUses: () => number;
  readonly out: () => string;
}

describeDb('orgunits classify - operator entry point (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let research: pg.Pool;
  let root: OrgunitRootFixture;

  beforeAll(() => {
    admin = adminPool();
    classifier = classifierPool();
    research = researchPool();
  });

  afterAll(async () => {
    await truncateAll(admin);
    await Promise.all([admin.end(), classifier.end(), research.end()]);
    for (const [key, name] of [
      ['research', 'DATABASE_URL_RESEARCH'],
      ['classifier', 'DATABASE_URL_CLASSIFIER'],
    ] as const) {
      if (PREVIOUS[key] === undefined) delete process.env[name];
      else process.env[name] = PREVIOUS[key];
    }
  });

  function harness(
    script: readonly ScriptedResponder[] = [],
    env: Readonly<Record<string, string | undefined>> = CLEAN_ENV,
  ): Harness {
    let created = 0;
    let provider: ScriptedTestProvider | null = null;
    let researchUses = 0;
    let classifierUses = 0;
    let out = '';
    return {
      deps: {
        withResearchPool: (fn) => {
          researchUses += 1;
          return fn(research);
        },
        withClassifierPool: (fn) => {
          classifierUses += 1;
          return fn(classifier);
        },
        env,
        repoRoot: '/zz-repo-root-for-tests',
        createProvider: () => {
          created += 1;
          provider = new ScriptedTestProvider(script);
          return Promise.resolve(provider);
        },
        stdout: (text) => {
          out += text;
        },
        stderr: (text) => {
          out += text;
        },
      },
      providerCreations: () => created,
      provider: () => provider,
      researchUses: () => researchUses,
      classifierUses: () => classifierUses,
      out: () => out,
    };
  }

  function options(overrides: Partial<ClassifyOptions> = {}): ClassifyOptions {
    return {
      organisationId: root.organisationId,
      model: MODEL,
      execute: false,
      json: false,
      ...overrides,
    };
  }

  async function snapshot(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const table of CLASSIFIER_TABLES) result[table] = await count(admin, table);
    return result;
  }

  async function freshRoot(): Promise<void> {
    await truncateAll(admin);
    root = await seedOrgunitRoot(admin);
  }

  async function seedRun(terminal: 'COMPLETED' | 'FAILED' | 'ABORTED' | null): Promise<string> {
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_research_runs
         (started_at, network_vantage, fetch_policy_version, rule_version)
       VALUES (now(), 'test', 'orgunit-fetch-policy-v1', 'orgunit-signal-rules-v1') RETURNING id`,
    );
    const runId = rows[0]!.id;
    if (terminal !== null) {
      await admin.query(
        `INSERT INTO orgunit_research_run_completions (run_id, terminal_state, error_kind, finished_at)
         VALUES ($1, $2, $3, now())`,
        [runId, terminal, terminal === 'COMPLETED' ? null : 'OTHER'],
      );
    }
    return runId;
  }

  async function seedRootFetch(runId: string, echeRowKey = root.echeRowKey): Promise<string> {
    const { rows } = await admin.query<{ root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          http_status, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, 'https://www.example.ac.uk/', 'www.example.ac.uk', 'example.ac.uk',
               'ROOT', 200, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING root_key`,
      [runId, root.websiteClaimId, echeRowKey],
    );
    return rows[0]!.root_key;
  }

  async function seedPage(opts: {
    runId: string;
    rootKey: string;
    path: string;
    title: string;
    mainText: string;
    track?: 'INTERNATIONAL_OFFICE' | 'LANGUAGE_CENTRE';
    rank?: number;
    headings?: readonly { level: 1 | 2 | 3; text: string }[];
  }): Promise<void> {
    const url = `https://www.example.ac.uk${opts.path}`;
    const claimId = opts.rootKey.slice('claim:'.length);
    const fetch = await admin.query<{ id: string; root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url, requested_host,
          requested_registrable_domain, discovery_method, discovery_parent_url,
          http_status, content_type, charset, charset_source, charset_confidence,
          response_sha256, byte_count, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, 'www.example.ac.uk', 'example.ac.uk', 'LINK',
               'https://www.example.ac.uk/', 200, 'text/html', 'utf-8',
               'HTTP_HEADER', 'DECLARED', $5, 4096, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING id, root_key`,
      [opts.runId, claimId, root.echeRowKey, url, sha(url)],
    );
    const page = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_evidence
         (fetch_observation_id, root_key, title, declared_lang, headings,
          main_text, main_text_chars, extraction_method, rule_version, observed_at)
       VALUES ($1, $2, $3, 'en', $5::jsonb, $4, length($4), 'MAIN_ELEMENT',
               'orgunit-extraction-v1', now())
       RETURNING id`,
      [
        fetch.rows[0]!.id,
        fetch.rows[0]!.root_key,
        opts.title,
        opts.mainText,
        JSON.stringify(opts.headings ?? []),
      ],
    );
    await admin.query(
      `INSERT INTO orgunit_page_candidates
         (page_evidence_id, run_id, root_key, track, candidate_score,
          signals, rank_within_root, rule_version)
       VALUES ($1, $2, $3, $4, 9, '[]'::jsonb, $5, 'orgunit-signal-rules-v1')`,
      [
        page.rows[0]!.id,
        opts.runId,
        fetch.rows[0]!.root_key,
        opts.track ?? 'INTERNATIONAL_OFFICE',
        opts.rank ?? 1,
      ],
    );
  }

  /** A completed run with `pages` eligible documents (titles "Unit Page N"). */
  async function completedRunWithPages(pages: number): Promise<string> {
    const runId = await seedRun('COMPLETED');
    const rootKey = await seedRootFetch(runId);
    for (let i = 0; i < pages; i += 1) {
      await seedPage({
        runId,
        rootKey,
        path: `/unit-${i}`,
        title: `Unit Page ${i}`,
        mainText: `Unit ${i} supports incoming students. ${MAIN_TEXT_SENTINEL}`,
        rank: i + 1,
      });
    }
    return runId;
  }

  /** Answers every document of the request; `fabricate` docIndexes get a quote absent from the page. */
  function answer(fabricate: ReadonlySet<number> = new Set()): ScriptedResponder {
    return (request: ClassifierProviderRequest): ClassifierProviderResult => {
      const batch = JSON.parse(request.serializedBatch) as {
        documents: { docIndex: number; title: string | null }[];
      };
      return scriptedOk({
        results: batch.documents.map((doc) => ({
          doc_index: doc.docIndex,
          verdict: 'UNIT_PAGE',
          unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
          page_kind: null,
          unit_name: doc.title,
          serves_incoming_international_students: 'YES',
          serves_outgoing_mobility_students: 'UNKNOWN',
          provides_language_learning_or_support: 'UNKNOWN',
          confidence: 'HIGH',
          rationale: `The title names the unit. ${RATIONALE_SENTINEL}`,
          evidence_spans: [
            {
              source: 'TITLE',
              quote: fabricate.has(doc.docIndex) ? 'Fabricated Quote Absent' : (doc.title ?? ''),
            },
          ],
        })),
      });
    };
  }

  // -------------------------------------------------------------------------
  // 38. DRY RUN
  // -------------------------------------------------------------------------

  it('dry run: reads completion, assembles, plans - zero provider construction, zero classifier rows', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(2);
    const before = await snapshot();
    const h = harness();

    const exit = await executeClassifyCommand(options({ runId, json: true }), h.deps);

    expect(exit).toBe(0);
    expect(h.researchUses()).toBe(1);
    expect(h.classifierUses()).toBe(1);
    expect(h.providerCreations()).toBe(0);
    expect(await snapshot()).toEqual(before);
    for (const table of CLASSIFIER_TABLES) expect(before[table], table).toBe(0);

    const report = JSON.parse(h.out()) as Record<string, unknown>;
    expect(report).toMatchObject({
      mode: 'DRY_RUN',
      organisationId: root.organisationId,
      runId,
      modelId: MODEL,
      attemptNo: 1,
      researchRunStatus: 'COMPLETED',
      assemblyStatus: 'BATCHES',
      batchCount: 1,
      totalDocumentCount: 2,
      classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
      promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
      repairPolicy: 'DISABLED',
      executionPreflight: { ok: true },
      executionPermitted: true,
      providerCalls: 0,
      classifierWrites: 0,
    });
    expect(report['batches']).toEqual([
      expect.objectContaining({
        batchIndex: 0,
        documentCount: 2,
        planState: 'READY_NEW_ATTEMPT',
        persistedState: 'ABSENT',
        existingCallId: null,
      }),
    ]);
    expect(String(report['note'])).toMatch(/no provider was constructed or invoked/);
  });

  it('dry run, human-readable: states the zero-provider/zero-write contract explicitly', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(1);
    const h = harness();
    expect(await executeClassifyCommand(options({ runId }), h.deps)).toBe(0);
    expect(h.out()).toContain('DRY_RUN orgunits classify');
    expect(h.out()).toContain('batch 0: READY_NEW_ATTEMPT');
    expect(h.out()).toContain('no classifier call, completion or classification row was written');
    expect(h.providerCreations()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 39. RUN COMPLETION GATE (research role)
  // -------------------------------------------------------------------------

  it.each([['FAILED'], ['ABORTED'], [null]] as const)(
    'a research run whose completion is %s refuses before assembly, provider or write',
    async (terminal) => {
      await freshRoot();
      const runId = await seedRun(terminal);
      const rootKey = await seedRootFetch(runId);
      await seedPage({ runId, rootKey, path: '/x', title: 'X', mainText: 'x' });
      const before = await snapshot();
      for (const execute of [false, true]) {
        const h = harness();
        const exit = await executeClassifyCommand(options({ runId, execute }), h.deps);
        expect(exit).toBe(1);
        expect(h.researchUses()).toBe(1);
        expect(h.classifierUses()).toBe(0);
        expect(h.providerCreations()).toBe(0);
        expect(h.out()).toContain(terminal ?? 'NO_COMPLETION_RECORDED');
        expect(h.out()).toContain('not COMPLETED');
      }
      expect(await snapshot()).toEqual(before);
    },
  );

  it('the research role reads the completion gate and the classifier role cannot', async () => {
    await freshRoot();
    const runId = await seedRun('COMPLETED');
    const h = harness();
    await expect(
      executeClassifyCommand(options({ runId }), {
        ...h.deps,
        // Mis-wiring the classifier pool into the research phase must fail on
        // the GRANT, never silently pass: nwf_classifier cannot read completions.
        withResearchPool: (fn) => fn(classifier),
      }),
    ).rejects.toThrow(/permission denied/i);
    expect(h.providerCreations()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 40. ORGANISATION / RUN MISMATCH
  // -------------------------------------------------------------------------

  it('a completed run whose evidence belongs to another organisation refuses via the landed assembler', async () => {
    await freshRoot();
    const runId = await seedRun('COMPLETED');
    await seedRootFetch(runId, 'Y OTHER01|999000222');
    const before = await snapshot();
    for (const execute of [false, true]) {
      const h = harness([answer()]);
      const exit = await executeClassifyCommand(options({ runId, execute }), h.deps);
      expect(exit).toBe(1);
      expect(h.out()).toContain('OrganisationRunMismatchError');
      expect(h.providerCreations()).toBe(0);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('an organisation id that does not exist refuses via the landed loader', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(1);
    const h = harness([answer()]);
    const exit = await executeClassifyCommand(
      options({ runId, organisationId: '00000000-0000-4000-8000-000000000000', execute: true }),
      h.deps,
    );
    expect(exit).toBe(1);
    expect(h.out()).toContain('OrganisationNotFoundError');
    expect(h.providerCreations()).toBe(0);
    expect(await count(admin, 'orgunit_classifier_calls')).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 41. NO CANDIDATES
  // -------------------------------------------------------------------------

  it('NO_CANDIDATES: success, reported, zero provider construction, zero classifier rows', async () => {
    await freshRoot();
    const runId = await seedRun('COMPLETED');
    await seedRootFetch(runId);
    for (const execute of [false, true]) {
      const h = harness();
      const exit = await executeClassifyCommand(options({ runId, execute, json: true }), h.deps);
      expect(exit).toBe(0);
      expect(h.providerCreations()).toBe(0);
      const report = JSON.parse(h.out()) as Record<string, unknown>;
      expect(execute ? report['result'] : report['assemblyStatus']).toBe('NO_CANDIDATES');
    }
    for (const table of CLASSIFIER_TABLES) expect(await count(admin, table), table).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 46 + 53. FAKE-PROVIDER EXECUTION, REPAIR DISABLED
  // -------------------------------------------------------------------------

  it('execute with a fake provider: the landed runtime persists, the summary is bounded, exit 0', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(2);
    const h = harness([answer()]);

    const exit = await executeClassifyCommand(
      options({ runId, execute: true, json: true }),
      h.deps,
    );

    expect(exit).toBe(0);
    expect(h.providerCreations()).toBe(1);
    expect(h.provider()!.callCount).toBe(1);
    const request = h.provider()!.requests[0]!;
    expect(request.modelId).toBe(MODEL);
    expect(request.runConfig).toEqual({});
    expect(await count(admin, 'orgunit_classifier_calls')).toBe(1);
    expect(await count(admin, 'orgunit_classifier_call_completions')).toBe(1);
    expect(await count(admin, 'orgunit_page_classifications')).toBe(2);
    const call = await admin.query<{
      model_id: string;
      attempt_no: number;
      request_config: unknown;
      repair_of_call_id: string | null;
    }>(
      `SELECT model_id, attempt_no, request_config, repair_of_call_id FROM orgunit_classifier_calls`,
    );
    expect(call.rows[0]).toEqual({
      model_id: MODEL,
      attempt_no: 1,
      request_config: {},
      repair_of_call_id: null,
    });

    const report = JSON.parse(h.out()) as { result: string; batches: Record<string, unknown>[] };
    expect(report.result).toBe('COMPLETED');
    expect(report.batches).toEqual([
      {
        batchIndex: 0,
        kind: 'EXECUTED',
        callId: expect.any(String),
        terminalState: 'COMPLETED',
        errorKind: null,
        documentCount: 2,
        acceptedCount: 2,
        rejectedCount: 0,
        repairCount: 0,
        repairedAcceptedCount: 0,
      },
    ]);
  });

  it('PARTIAL: persisted, exit non-zero, no rollback - and a repair-eligible EVIDENCE rejection is NOT repaired', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(2);
    // docIndex 1 gets a fabricated quote: an EVIDENCE rejection, exactly the
    // class ADR 0011's one-round repair WOULD re-ask if it were enabled.
    const h = harness([answer(new Set([1]))]);

    const exit = await executeClassifyCommand(
      options({ runId, execute: true, json: true }),
      h.deps,
    );

    expect(exit).toBe(1);
    expect(h.provider()!.callCount).toBe(1);
    const completion = await admin.query<{ terminal_state: string }>(
      `SELECT terminal_state FROM orgunit_classifier_call_completions`,
    );
    expect(completion.rows.map((r) => r.terminal_state)).toEqual(['PARTIAL']);
    expect(await count(admin, 'orgunit_classifier_calls')).toBe(1);
    expect(await count(admin, 'orgunit_page_classifications')).toBe(1);
    const report = JSON.parse(h.out()) as { result: string; batches: Record<string, unknown>[] };
    expect(report.result).toBe('NOT_COMPLETED');
    expect(report.batches[0]).toMatchObject({
      terminalState: 'PARTIAL',
      acceptedCount: 1,
      rejectedCount: 1,
      repairCount: 0,
      repairedAcceptedCount: 0,
    });
  });

  it('FAILED: persisted with its error kind, exit non-zero, no rollback', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(1);
    const h = harness([scriptedRefusal()]);

    const exit = await executeClassifyCommand(
      options({ runId, execute: true, json: true }),
      h.deps,
    );

    expect(exit).toBe(1);
    const completion = await admin.query<{ terminal_state: string; error_kind: string }>(
      `SELECT terminal_state, error_kind FROM orgunit_classifier_call_completions`,
    );
    expect(completion.rows).toEqual([{ terminal_state: 'FAILED', error_kind: 'PROVIDER_REFUSAL' }]);
    const report = JSON.parse(h.out()) as { batches: Record<string, unknown>[] };
    expect(report.batches[0]).toMatchObject({
      kind: 'EXECUTED',
      terminalState: 'FAILED',
      errorKind: 'PROVIDER_REFUSAL',
      acceptedCount: 0,
    });
  });

  // -------------------------------------------------------------------------
  // 42. COMPLETED REUSE
  // -------------------------------------------------------------------------

  it('COMPLETED reuse: same org/run/model/attempt - REUSED, zero provider, zero new rows', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(2);
    expect(
      await executeClassifyCommand(options({ runId, execute: true }), harness([answer()]).deps),
    ).toBe(0);
    const before = await snapshot();

    const h = harness();
    const exit = await executeClassifyCommand(
      options({ runId, execute: true, json: true }),
      h.deps,
    );

    expect(exit).toBe(0);
    expect(h.providerCreations()).toBe(0);
    expect(await snapshot()).toEqual(before);
    const report = JSON.parse(h.out()) as { batches: Record<string, unknown>[] };
    expect(report.batches).toEqual([
      expect.objectContaining({
        kind: 'REUSED',
        terminalState: 'COMPLETED',
        documentCount: 2,
        acceptedCount: 2,
      }),
    ]);

    // And the dry run reports the same batch as REUSABLE_COMPLETED.
    const dry = harness();
    expect(await executeClassifyCommand(options({ runId, json: true }), dry.deps)).toBe(0);
    expect((JSON.parse(dry.out()) as { batches: unknown[] }).batches).toEqual([
      expect.objectContaining({ planState: 'REUSABLE_COMPLETED', persistedState: 'COMPLETED' }),
    ]);
  });

  // -------------------------------------------------------------------------
  // 43. NON-COMPLETED EXISTING ATTEMPT
  // -------------------------------------------------------------------------

  async function seedExistingAttempt(
    runId: string,
    batchIndex: number,
    state: 'FAILED' | 'PARTIAL' | 'NO_COMPLETION_RECORDED',
    attemptNo = 1,
  ): Promise<string> {
    const plan = await planOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: { status: 'COMPLETED' },
      modelId: MODEL,
      attemptNo,
    });
    if (plan.kind !== 'BATCHES') throw new Error('expected batches');
    const batch = plan.batches[batchIndex]!;
    const callId = await insertClassifierCall(classifier, {
      runId,
      echeRowKey: root.echeRowKey,
      organisationId: root.organisationId,
      rootKey: null,
      modelId: MODEL,
      promptVersion: ORGUNIT_CLASSIFIER_PROMPT_VERSION,
      classifierVersion: ORGUNIT_CLASSIFIER_ASSEMBLY_VERSION,
      outputSchemaVersion: ORGUNIT_CLASSIFIER_OUTPUT_SCHEMA_VERSION,
      requestConfig: {},
      inputSha256: batch.inputSha256,
      inputDocumentCount: batch.documentCount,
      attemptNo,
    });
    if (state !== 'NO_COMPLETION_RECORDED') {
      await insertCompletion(classifier, {
        callId,
        terminalState: state,
        responseModelId: null,
        inputTokens: null,
        outputTokens: null,
        errorKind: state === 'FAILED' ? 'PROVIDER_TRANSIENT' : 'EVIDENCE_SPAN_UNVERIFIED',
        errorSummary: 'seeded',
      });
    }
    return callId;
  }

  it.each([['FAILED'], ['PARTIAL'], ['NO_COMPLETION_RECORDED']] as const)(
    'an existing %s call at the requested attempt refuses the whole command before the provider',
    async (state) => {
      await freshRoot();
      const runId = await completedRunWithPages(2);
      const existing = await seedExistingAttempt(runId, 0, state);
      const before = await snapshot();

      const h = harness([answer()]);
      const exit = await executeClassifyCommand(options({ runId, execute: true }), h.deps);

      expect(exit).toBe(1);
      expect(h.providerCreations()).toBe(0);
      expect(await snapshot()).toEqual(before);
      const text = h.out();
      expect(text).toContain(`requested attempt 1 already exists`);
      expect(text).toContain(`exists as ${state}`);
      expect(text).toContain(existing);
      expect(text).toContain('will NOT be overwritten');
      expect(text).toContain('will NOT be retried automatically');
      expect(text).toContain('choose a higher --attempt');
      expect(text).not.toMatch(/duplicate key|unique constraint|identity_uidx/i);

      // The dry run reports the same refusal, and exits non-zero because an
      // --execute with these arguments would not be permitted to start.
      const dry = harness();
      expect(await executeClassifyCommand(options({ runId, json: true }), dry.deps)).toBe(1);
      const report = JSON.parse(dry.out()) as Record<string, unknown>;
      expect(report['executionPermitted']).toBe(false);
      expect(report['batches']).toEqual([
        expect.objectContaining({
          planState: 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED',
          persistedState: state,
          existingCallId: existing,
        }),
      ]);
    },
  );

  // -------------------------------------------------------------------------
  // 44. EXPLICIT NEXT ATTEMPT
  // -------------------------------------------------------------------------

  it('an explicit --attempt 2 after a FAILED attempt 1 is planned new, executes as attempt 2, and leaves attempt 1 untouched', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(1);
    expect(
      await executeClassifyCommand(
        options({ runId, execute: true }),
        harness([scriptedRefusal()]).deps,
      ),
    ).toBe(1);
    const attempt1 = await admin.query(
      `SELECT c.*, comp.terminal_state, comp.error_kind
         FROM orgunit_classifier_calls c
         JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id`,
    );

    const dry = harness();
    expect(
      await executeClassifyCommand(options({ runId, attempt: '2', json: true }), dry.deps),
    ).toBe(0);
    expect((JSON.parse(dry.out()) as { batches: unknown[] }).batches).toEqual([
      expect.objectContaining({ planState: 'READY_NEW_ATTEMPT', persistedState: 'ABSENT' }),
    ]);

    const h = harness([answer()]);
    expect(
      await executeClassifyCommand(options({ runId, attempt: '2', execute: true }), h.deps),
    ).toBe(0);
    const attempts = await admin.query<{ attempt_no: number; terminal_state: string }>(
      `SELECT c.attempt_no, comp.terminal_state
         FROM orgunit_classifier_calls c
         JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id
        ORDER BY c.attempt_no`,
    );
    expect(attempts.rows).toEqual([
      { attempt_no: 1, terminal_state: 'FAILED' },
      { attempt_no: 2, terminal_state: 'COMPLETED' },
    ]);
    const attempt1After = await admin.query(
      `SELECT c.*, comp.terminal_state, comp.error_kind
         FROM orgunit_classifier_calls c
         JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id
        WHERE c.attempt_no = 1`,
    );
    expect(attempt1After.rows).toEqual(attempt1.rows);

    // Attempt 1 is never retried implicitly: re-running WITHOUT --attempt still refuses.
    const again = harness([answer()]);
    expect(await executeClassifyCommand(options({ runId, execute: true }), again.deps)).toBe(1);
    expect(again.providerCreations()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 45. GLOBAL MULTI-BATCH PRECHECK
  // -------------------------------------------------------------------------

  it('multi-batch: one PARTIAL collision refuses the WHOLE execution start - zero provider, zero new rows for the ready batch', async () => {
    await freshRoot();
    const runId = await seedRun('COMPLETED');
    const rootKey = await seedRootFetch(runId);
    // 16 large documents (8 per track) overflow the 64k-code-point payload
    // bound, so the landed packer splits them into more than one batch.
    const filler = (seed: string): string =>
      Array.from({ length: 60 }, (_, i) => `${seed} sentence ${i} about mobility support.`).join(
        ' ',
      );
    for (const track of ['INTERNATIONAL_OFFICE', 'LANGUAGE_CENTRE'] as const) {
      for (let rank = 1; rank <= 8; rank += 1) {
        const id = `${track}-${rank}`;
        await seedPage({
          runId,
          rootKey,
          path: `/${id.toLowerCase()}`,
          title: `Page ${id}`,
          mainText: filler(id),
          track,
          rank,
          headings: Array.from({ length: 12 }, (_, i) => ({
            level: 2 as const,
            text: `${id} heading ${i} ${'x'.repeat(180)}`,
          })),
        });
      }
    }

    const plan = await planOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion: { status: 'COMPLETED' },
      modelId: MODEL,
      attemptNo: 1,
    });
    if (plan.kind !== 'BATCHES') throw new Error('expected batches');
    expect(plan.batches.length).toBeGreaterThan(1);

    const last = plan.batches.length - 1;
    await seedExistingAttempt(runId, last, 'PARTIAL');
    const before = await snapshot();

    const h = harness(plan.batches.map(() => answer()));
    const exit = await executeClassifyCommand(options({ runId, execute: true }), h.deps);

    expect(exit).toBe(1);
    expect(h.providerCreations()).toBe(0);
    expect(await snapshot()).toEqual(before);
    expect(await count(admin, 'orgunit_classifier_calls')).toBe(1);
    expect(h.out()).toContain(`batch ${last}: attempt 1 exists as PARTIAL`);

    const dry = harness();
    expect(await executeClassifyCommand(options({ runId, json: true }), dry.deps)).toBe(1);
    const states = (JSON.parse(dry.out()) as { batches: { planState: string }[] }).batches.map(
      (b) => b.planState,
    );
    expect(states.filter((s) => s === 'READY_NEW_ATTEMPT')).toHaveLength(plan.batches.length - 1);
    expect(states[last]).toBe('ATTEMPT_ALREADY_EXISTS_NON_COMPLETED');
  });

  // -------------------------------------------------------------------------
  // 48. PURE PREFLIGHT REFUSAL (row-less)
  // -------------------------------------------------------------------------

  it('a conflicting auth variable refuses --execute before any database access or provider', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(1);
    const conflicting = FORBIDDEN_AUTH_VARIABLES[0]!;
    const h = harness([answer()], { ...CLEAN_ENV, [conflicting]: ENV_SENTINEL });
    const exit = await executeClassifyCommand(options({ runId, execute: true }), h.deps);
    expect(exit).toBe(1);
    expect(h.researchUses()).toBe(0);
    expect(h.classifierUses()).toBe(0);
    expect(h.providerCreations()).toBe(0);
    expect(h.out()).toContain('CONFLICTING_AUTH_VARIABLES');
    expect(h.out()).toContain(conflicting);
    expect(h.out()).not.toContain(ENV_SENTINEL);
    for (const table of CLASSIFIER_TABLES) expect(await count(admin, table), table).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 52. OUTPUT FIREWALL
  // -------------------------------------------------------------------------

  it('operator output never carries page text, prompt, serialized batch, model prose, env or profile paths', async () => {
    await freshRoot();
    const runId = await completedRunWithPages(2);
    const outputs: string[] = [];
    for (const [opts, script] of [
      [options({ runId }), []],
      [options({ runId, json: true }), []],
      [options({ runId, execute: true }), [answer(new Set([1]))]],
    ] as const) {
      const h = harness(script);
      await executeClassifyCommand(opts, h.deps);
      outputs.push(h.out());
    }
    await freshRoot();
    const runId2 = await completedRunWithPages(1);
    const h = harness([answer()]);
    await executeClassifyCommand(options({ runId: runId2, execute: true, json: true }), h.deps);
    outputs.push(h.out());

    const forbidden = [
      MAIN_TEXT_SENTINEL,
      RATIONALE_SENTINEL,
      ENV_SENTINEL,
      HOME_SENTINEL,
      '.claude-nwf-classifier',
      '/zz-repo-root-for-tests',
      ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.slice(0, 60),
      '"excerpt"',
      '"serializedBatch"',
      '"documents"',
      'Unit Page 0',
      'https://www.example.ac.uk/unit-0',
      'evidence_spans',
      'Fabricated Quote Absent',
    ];
    for (const output of outputs) {
      expect(output.length).toBeGreaterThan(0);
      for (const banned of forbidden) expect(output, banned).not.toContain(banned);
    }
  });

  // -------------------------------------------------------------------------
  // 51. THE REAL CLI ROUTER (no provider can be reached on these paths)
  // -------------------------------------------------------------------------

  describe('through the real src/cli/index.ts router', () => {
    let main: (argv: string[]) => Promise<number>;
    let captured = '';
    const originalOut = process.stdout.write.bind(process.stdout);
    const originalErr = process.stderr.write.bind(process.stderr);

    beforeAll(async () => {
      ({ main } = await import('../../cli/index.js'));
    });

    async function run(argv: string[]): Promise<number> {
      captured = '';
      const capture = ((chunk: unknown): boolean => {
        captured += typeof chunk === 'string' ? chunk : String(chunk);
        return true;
      }) as typeof process.stdout.write;
      process.stdout.write = capture;
      process.stderr.write = capture;
      try {
        return await main(argv);
      } finally {
        process.stdout.write = originalOut;
        process.stderr.write = originalErr;
      }
    }

    it('routes `orgunits classify` (dry run) to the operator command with production roles', async () => {
      await freshRoot();
      const runId = await completedRunWithPages(1);
      const before = await snapshot();
      const exit = await run([
        'orgunits',
        'classify',
        '--organisation-id',
        root.organisationId,
        '--run-id',
        runId,
        '--model',
        MODEL,
        '--json',
      ]);
      const report = JSON.parse(captured) as {
        mode: string;
        executionPreflight: { ok: boolean };
        batchCount: number;
      };
      expect(report.mode).toBe('DRY_RUN');
      expect(report.batchCount).toBe(1);
      // The real process environment decides the preflight; the exit code follows it exactly.
      expect(exit).toBe(report.executionPreflight.ok ? 0 : 1);
      expect(await snapshot()).toEqual(before);
    });

    it('--execute with a conflicting auth variable in the process environment refuses row-lessly', async () => {
      await freshRoot();
      const runId = await completedRunWithPages(1);
      const conflicting = FORBIDDEN_AUTH_VARIABLES[0]!;
      const previous = process.env[conflicting];
      process.env[conflicting] = ENV_SENTINEL;
      try {
        const exit = await run([
          'orgunits',
          'classify',
          '--organisation-id',
          root.organisationId,
          '--run-id',
          runId,
          '--model',
          MODEL,
          '--execute',
        ]);
        expect(exit).toBe(1);
        expect(captured).toContain('CONFLICTING_AUTH_VARIABLES');
        expect(captured).not.toContain(ENV_SENTINEL);
      } finally {
        if (previous === undefined) delete process.env[conflicting];
        else process.env[conflicting] = previous;
      }
      for (const table of CLASSIFIER_TABLES) expect(await count(admin, table), table).toBe(0);
    });

    it.each([
      [['--run-id', '00000000-0000-4000-8000-000000000001', '--model', 'x'], /--organisation-id/],
      [['--organisation-id', '00000000-0000-4000-8000-000000000001', '--model', 'x'], /--run-id/],
      [
        [
          '--organisation-id',
          '00000000-0000-4000-8000-000000000001',
          '--run-id',
          '00000000-0000-4000-8000-000000000002',
        ],
        /--model/,
      ],
      [
        [
          '--organisation-id',
          '00000000-0000-4000-8000-000000000001',
          '--run-id',
          '00000000-0000-4000-8000-000000000002',
          '--model',
          'not-an-allowed-model',
          '--execute',
        ],
        /MODEL_NOT_ALLOWED/,
      ],
      [
        [
          '--organisation-id',
          '00000000-0000-4000-8000-000000000001',
          '--run-id',
          '00000000-0000-4000-8000-000000000002',
          '--model',
          'x',
          '--attempt',
          '0',
        ],
        /--attempt must be a positive integer/,
      ],
    ])('refuses %j row-lessly', async (args, message) => {
      await freshRoot();
      const exit = await run(['orgunits', 'classify', ...args]);
      expect(exit).toBe(1);
      expect(captured).toMatch(message);
      for (const table of CLASSIFIER_TABLES) expect(await count(admin, table), table).toBe(0);
    });

    it('unknown classify options still fail strict parsing', async () => {
      for (const flag of ['--all', '--repair', '--max-turns', '--latest', '--effort']) {
        await expect(main(['orgunits', 'classify', flag])).rejects.toThrow();
      }
    });
  });
});

/**
 * CLASSIFIER_OPERATOR_CONTROL_PLANE_CONTRACT_V1 — the machine contract over
 * the REAL landed classifier action and reads, against `nwf_pe_test`:
 *
 *   - every handled `--json` outcome is exactly one versioned envelope on
 *     stdout, whose operation, code, outcome and exit status agree with the
 *     process exit the command returned;
 *   - the action's DRY_RUN and EXECUTE outcomes (permitted, preflight
 *     refusal, research run not completed, no candidates, organisation not
 *     found, assembly refusal, completed, full reuse, persisted PARTIAL and
 *     FAILED, non-completed attempt collision) each map onto their code;
 *   - the reads (runs, calls, show ordinary, show repair, organisation and
 *     call not found) carry the landed read model unchanged under `data`;
 *   - no machine output carries page text, the system prompt, the serialized
 *     batch, an environment value or the profile path, and the action output
 *     carries no model rationale;
 *   - refusals write nothing and construct no provider.
 *
 * The provider is the landed `ScriptedTestProvider`: no real provider, no
 * network, no subscription.
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type pg from 'pg';

import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  count,
  readonlyPool,
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
import {
  executeClassifyReadCommand,
  type ClassifyReadOptions,
} from '../../cli/commands/classifyRead.js';
import { main } from '../../cli/index.js';
import {
  CLASSIFIER_OPERATOR_CODES,
  CLASSIFIER_OPERATOR_CONTRACT_VERSION,
  type ClassifierOperatorEnvelope,
} from '../../orgunits/classify/operatorContract.js';
import { ORGUNIT_CLASSIFIER_SYSTEM_PROMPT } from '../../orgunits/classify/prompt.js';
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

// MUST run before anything calls `config/env.ts`'s `env()`: the real router's
// production readonly variable points at the TEST database.
const PREVIOUS_READONLY = process.env.DATABASE_URL_READONLY;
if (process.env.DATABASE_URL_READONLY_TEST) {
  process.env.DATABASE_URL_READONLY = process.env.DATABASE_URL_READONLY_TEST;
}

const configured =
  classifierDatabaseConfigured() &&
  researchDatabaseConfigured() &&
  process.env.DATABASE_URL_READONLY_TEST !== undefined;
const describeDb = configured ? describe : describe.skip;

const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
const CLASSIFIER_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];
const MAIN_TEXT_SENTINEL = 'zz-contract-main-text-sentinel';
const RATIONALE_SENTINEL = 'zz-contract-rationale-sentinel';
const ENV_SENTINEL = 'zz-contract-environment-value-sentinel';
const HOME_SENTINEL = '/zz-contract-home-sentinel';
const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

const CLEAN_ENV: Readonly<Record<string, string>> = Object.freeze({
  HOME: HOME_SENTINEL,
  NWF_PE_CONTRACT_TEST_SENTINEL: ENV_SENTINEL,
});

const sha = (seed: string): string => createHash('sha256').update(seed).digest('hex');

interface Captured {
  readonly exit: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Parses machine stdout as EXACTLY one JSON document (JSON.parse rejects a
 * second document or any prose around it) and checks the envelope invariants
 * every handled outcome must satisfy.
 */
function envelopeOf(captured: Captured): ClassifierOperatorEnvelope<Record<string, unknown>> {
  expect(captured.stdout.endsWith('}\n'), captured.stdout).toBe(true);
  expect(captured.stdout.startsWith('{'), captured.stdout).toBe(true);
  const envelope = JSON.parse(captured.stdout) as ClassifierOperatorEnvelope<
    Record<string, unknown>
  >;
  expect(Object.keys(envelope).sort()).toEqual(
    ['code', 'contractVersion', 'data', 'exitCode', 'operation', 'outcome', 'reason'].sort(),
  );
  expect(envelope.contractVersion).toBe(CLASSIFIER_OPERATOR_CONTRACT_VERSION);
  expect(envelope.outcome).toBe(CLASSIFIER_OPERATOR_CODES[envelope.code]);
  expect(envelope.exitCode).toBe(captured.exit);
  expect(envelope.exitCode).toBe(envelope.outcome === 'SUCCEEDED' ? 0 : 1);
  expect(captured.stdout).not.toMatch(/^ERROR |^error: /m);
  // Nothing the contract forbids, in any machine output.
  for (const forbidden of [
    MAIN_TEXT_SENTINEL,
    ENV_SENTINEL,
    HOME_SENTINEL,
    ORGUNIT_CLASSIFIER_SYSTEM_PROMPT.slice(0, 60),
    'serializedBatch',
    'postgres://',
    'DATABASE_URL',
  ]) {
    expect(captured.stdout, forbidden).not.toContain(forbidden);
  }
  return envelope;
}

describeDb('classifier operator machine contract V1 (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let research: pg.Pool;
  let readonly: pg.Pool;
  let root: OrgunitRootFixture;

  beforeAll(async () => {
    admin = adminPool();
    classifier = classifierPool();
    research = researchPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    root = await seedOrgunitRoot(admin);
  });

  afterAll(async () => {
    await truncateAll(admin);
    await Promise.all([admin.end(), classifier.end(), research.end(), readonly.end()]);
    if (PREVIOUS_READONLY === undefined) delete process.env.DATABASE_URL_READONLY;
    else process.env.DATABASE_URL_READONLY = PREVIOUS_READONLY;
  });

  // -------------------------------------------------------------------------
  // Seeding (admin role, test database only) - the entry-point suite's shapes.
  // -------------------------------------------------------------------------

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

  async function seedPage(runId: string, rootKey: string, i: number): Promise<void> {
    const url = `https://www.example.ac.uk/unit-${i}-${runId}`;
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
      [runId, rootKey.slice('claim:'.length), root.echeRowKey, url, sha(url)],
    );
    const page = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_page_evidence
         (fetch_observation_id, root_key, title, declared_lang, headings,
          main_text, main_text_chars, extraction_method, rule_version, observed_at)
       VALUES ($1, $2, $3, 'en', '[]'::jsonb, $4, length($4), 'MAIN_ELEMENT',
               'orgunit-extraction-v1', now())
       RETURNING id`,
      [
        fetch.rows[0]!.id,
        fetch.rows[0]!.root_key,
        `Unit Page ${i}`,
        `Unit ${i} supports incoming students. ${MAIN_TEXT_SENTINEL}`,
      ],
    );
    await admin.query(
      `INSERT INTO orgunit_page_candidates
         (page_evidence_id, run_id, root_key, track, candidate_score,
          signals, rank_within_root, rule_version)
       VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 9, '[]'::jsonb, $4, 'orgunit-signal-rules-v1')`,
      [page.rows[0]!.id, runId, fetch.rows[0]!.root_key, i + 1],
    );
  }

  async function completedRunWithPages(pages: number): Promise<string> {
    const runId = await seedRun('COMPLETED');
    const rootKey = await seedRootFetch(runId);
    for (let i = 0; i < pages; i += 1) await seedPage(runId, rootKey, i);
    return runId;
  }

  /** Answers every document; `fabricate` docIndexes quote text absent from the page. */
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

  async function snapshot(): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const table of CLASSIFIER_TABLES) result[table] = await count(admin, table);
    return result;
  }

  // -------------------------------------------------------------------------
  // Drivers: stdout and stderr captured SEPARATELY.
  // -------------------------------------------------------------------------

  async function act(
    overrides: Partial<ClassifyOptions>,
    script: readonly ScriptedResponder[] = [],
    env: Readonly<Record<string, string | undefined>> = CLEAN_ENV,
  ): Promise<Captured & { providers: number; classifierUses: number }> {
    let stdout = '';
    let stderr = '';
    let providers = 0;
    let classifierUses = 0;
    const deps: ClassifyDependencies = {
      withResearchPool: (fn) => fn(research),
      withClassifierPool: (fn) => {
        classifierUses += 1;
        return fn(classifier);
      },
      env,
      repoRoot: '/zz-contract-repo-root',
      createProvider: () => {
        providers += 1;
        return Promise.resolve(new ScriptedTestProvider(script));
      },
      stdout: (t) => {
        stdout += t;
      },
      stderr: (t) => {
        stderr += t;
      },
    };
    const exit = await executeClassifyCommand(
      {
        organisationId: root.organisationId,
        model: MODEL,
        execute: false,
        json: true,
        ...overrides,
      },
      deps,
    );
    return { exit, stdout, stderr, providers, classifierUses };
  }

  async function read(
    options: Partial<ClassifyReadOptions> & { positionals: string[] },
  ): Promise<Captured> {
    let stdout = '';
    let stderr = '';
    const supplied: string[] = ['json'];
    if (options.organisationId !== undefined) supplied.push('organisation-id');
    if (options.runId !== undefined) supplied.push('run-id');
    if (options.callId !== undefined) supplied.push('call-id');
    const exit = await executeClassifyReadCommand(
      { suppliedOptions: supplied, json: true, ...options },
      {
        withReadonlyPool: (fn) => fn(readonly),
        stdout: (t) => {
          stdout += t;
        },
        stderr: (t) => {
          stderr += t;
        },
      },
    );
    return { exit, stdout, stderr };
  }

  // -------------------------------------------------------------------------
  // ACTION - DRY_RUN.
  // -------------------------------------------------------------------------

  it('a permitted dry run is DRY_RUN_EXECUTION_PERMITTED with the landed report under data, no provider and no write', async () => {
    const runId = await completedRunWithPages(1);
    const before = await snapshot();
    const r = await act({ runId });
    const e = envelopeOf(r);
    expect(e).toMatchObject({
      operation: 'CLASSIFY',
      outcome: 'SUCCEEDED',
      code: 'DRY_RUN_EXECUTION_PERMITTED',
      exitCode: 0,
      reason: null,
    });
    expect(e.data).toMatchObject({
      mode: 'DRY_RUN',
      runId,
      assemblyStatus: 'BATCHES',
      batchCount: 1,
      executionPermitted: true,
      providerCalls: 0,
      classifierWrites: 0,
      repairPolicy: 'DISABLED',
    });
    expect(r.stderr).toBe('');
    expect(r.providers).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it('a dry run whose execution preflight refuses is DRY_RUN_EXECUTION_NOT_PERMITTED (PREFLIGHT_REFUSED), never the variable value', async () => {
    const runId = await completedRunWithPages(1);
    const conflicting = FORBIDDEN_AUTH_VARIABLES[0]!;
    const r = await act({ runId }, [], { ...CLEAN_ENV, [conflicting]: ENV_SENTINEL });
    const e = envelopeOf(r);
    expect(e).toMatchObject({
      outcome: 'REFUSED',
      code: 'DRY_RUN_EXECUTION_NOT_PERMITTED',
      exitCode: 1,
      reason: { kind: 'DRY_RUN_EXECUTION_NOT_PERMITTED', blockedBy: ['PREFLIGHT_REFUSED'] },
    });
    expect(e.data).toMatchObject({
      executionPreflight: { ok: false, kind: 'CONFLICTING_AUTH_VARIABLES' },
    });
    expect(r.providers).toBe(0);
  });

  it('with --execute the same environment is PREFLIGHT_REFUSED before any pool', async () => {
    const runId = await completedRunWithPages(1);
    const conflicting = FORBIDDEN_AUTH_VARIABLES[0]!;
    const before = await snapshot();
    const r = await act({ runId, execute: true }, [answer()], {
      ...CLEAN_ENV,
      [conflicting]: ENV_SENTINEL,
    });
    expect(envelopeOf(r)).toMatchObject({
      code: 'PREFLIGHT_REFUSED',
      outcome: 'REFUSED',
      data: null,
      reason: { kind: 'PREFLIGHT_REFUSED', preflightKind: 'CONFLICTING_AUTH_VARIABLES' },
    });
    expect(r.classifierUses).toBe(0);
    expect(r.providers).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ['FAILED', 'OTHER'],
    ['ABORTED', 'OTHER'],
    [null, null],
  ] as const)(
    'a research run in state %s is RESEARCH_RUN_NOT_COMPLETED in both modes, before the classifier pool',
    async (terminal, errorKind) => {
      const runId = await seedRun(terminal);
      for (const execute of [false, true]) {
        const r = await act({ runId, execute }, [answer()]);
        expect(envelopeOf(r)).toMatchObject({
          code: 'RESEARCH_RUN_NOT_COMPLETED',
          outcome: 'REFUSED',
          reason: {
            kind: 'RESEARCH_RUN_NOT_COMPLETED',
            runId,
            researchRunStatus: terminal ?? 'NO_COMPLETION_RECORDED',
            researchRunErrorKind: errorKind,
          },
        });
        expect(r.classifierUses).toBe(0);
        expect(r.providers).toBe(0);
      }
    },
  );

  it('a completed run with nothing eligible is DRY_RUN_NO_CANDIDATES / EXECUTE_NO_CANDIDATES, both exit 0, no provider', async () => {
    const runId = await seedRun('COMPLETED');
    await seedRootFetch(runId);
    const before = await snapshot();
    const dry = await act({ runId });
    expect(envelopeOf(dry)).toMatchObject({ code: 'DRY_RUN_NO_CANDIDATES', exitCode: 0 });
    expect(envelopeOf(dry).data).toMatchObject({ assemblyStatus: 'NO_CANDIDATES', batchCount: 0 });
    const exec = await act({ runId, execute: true }, [answer()]);
    expect(envelopeOf(exec)).toMatchObject({ code: 'EXECUTE_NO_CANDIDATES', exitCode: 0 });
    expect(envelopeOf(exec).data).toMatchObject({ result: 'NO_CANDIDATES', providerCalls: 0 });
    expect(exec.providers).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it('an organisation that does not exist is ORGANISATION_NOT_FOUND; a run of another organisation is CLASSIFIER_ASSEMBLY_REFUSED by class, never by message', async () => {
    const runId = await completedRunWithPages(1);
    const missing = await act({ runId, organisationId: UNKNOWN_UUID, execute: true }, [answer()]);
    expect(envelopeOf(missing)).toMatchObject({
      code: 'ORGANISATION_NOT_FOUND',
      outcome: 'NOT_FOUND',
      reason: { kind: 'ORGANISATION_NOT_FOUND', organisationId: UNKNOWN_UUID },
    });
    // The landed human diagnostic still names the class on stderr.
    expect(missing.stderr).toContain('OrganisationNotFoundError');

    const otherRun = await seedRun('COMPLETED');
    await seedRootFetch(otherRun, 'Y OTHER01|999000222');
    const mismatch = await act({ runId: otherRun, execute: true }, [answer()]);
    const e = envelopeOf(mismatch);
    expect(e).toMatchObject({
      code: 'CLASSIFIER_ASSEMBLY_REFUSED',
      reason: {
        kind: 'CLASSIFIER_ASSEMBLY_REFUSED',
        assemblyRefusalCode: 'ORGANISATION_RUN_MISMATCH',
      },
    });
    expect(mismatch.stdout).not.toContain('Y OTHER01');
    expect(mismatch.providers).toBe(0);
  });

  // -------------------------------------------------------------------------
  // ACTION - EXECUTE, then READS over what it persisted.
  // -------------------------------------------------------------------------

  it('execute -> COMPLETED, reuse -> COMPLETED with no provider, and the reads wrap the landed models unchanged', async () => {
    const runId = await completedRunWithPages(2);
    const first = await act({ runId, execute: true }, [answer()]);
    const e1 = envelopeOf(first);
    expect(e1).toMatchObject({ code: 'EXECUTE_COMPLETED', outcome: 'SUCCEEDED', exitCode: 0 });
    const batches = (e1.data as { batches: { kind: string; callId: string }[] }).batches;
    expect(batches.map((b) => b.kind)).toEqual(['EXECUTED']);
    expect(first.providers).toBe(1);
    // The action output is ids/states/counts: never the model's rationale.
    expect(first.stdout).not.toContain(RATIONALE_SENTINEL);
    const callId = batches[0]!.callId;

    const before = await snapshot();
    const reuse = await act({ runId, execute: true }, []);
    const e2 = envelopeOf(reuse);
    expect(e2).toMatchObject({ code: 'EXECUTE_COMPLETED', exitCode: 0 });
    expect((e2.data as { batches: { kind: string; callId: string }[] }).batches).toMatchObject([
      { kind: 'REUSED', callId },
    ]);
    expect(reuse.providers).toBe(0);
    expect(await snapshot()).toEqual(before);

    // runs
    const runs = envelopeOf(
      await read({ positionals: ['runs'], organisationId: root.organisationId }),
    );
    expect(runs).toMatchObject({
      operation: 'CLASSIFY_RUNS',
      code: 'READ_SUCCEEDED',
      reason: null,
    });
    expect((runs.data as { runs: { runId: string }[] }).runs.map((r) => r.runId)).toContain(runId);

    // calls
    const calls = envelopeOf(
      await read({ positionals: ['calls'], organisationId: root.organisationId, runId }),
    );
    expect(calls).toMatchObject({ operation: 'CLASSIFY_CALLS', code: 'READ_SUCCEEDED' });
    expect((calls.data as { calls: { callId: string }[] }).calls.map((c) => c.callId)).toEqual([
      callId,
    ]);

    // show ordinary: the authorised persisted rationale is visible, page text is not.
    const shown = await read({ positionals: ['show'], callId });
    const s = envelopeOf(shown);
    expect(s).toMatchObject({ operation: 'CLASSIFY_SHOW', code: 'READ_SUCCEEDED' });
    expect(s.data).toMatchObject({ callKind: 'ORDINARY' });
    expect(shown.stdout).toContain(RATIONALE_SENTINEL);

    // show repair: a repair call of that ordinary call.
    const { rows } = await admin.query<{ id: string }>(
      `INSERT INTO orgunit_classifier_calls
         (run_id, eche_row_key, organisation_id, root_key, model_id, prompt_version,
          classifier_version, output_schema_version, input_sha256, input_document_count,
          attempt_no, requested_at, repair_of_call_id, repair_doc_index)
       SELECT run_id, eche_row_key, organisation_id, root_key, model_id, prompt_version,
              classifier_version, output_schema_version, $2, 1, attempt_no, now(), id, 0
         FROM orgunit_classifier_calls WHERE id = $1
       RETURNING id`,
      [callId, sha(`repair-${callId}`)],
    );
    const repairId = rows[0]!.id;
    const repair = envelopeOf(await read({ positionals: ['show'], callId: repairId }));
    expect(repair).toMatchObject({ operation: 'CLASSIFY_SHOW', code: 'READ_SUCCEEDED' });
    expect(repair.data).toMatchObject({
      callKind: 'REPAIR',
      effectiveViewBelongsToOrdinaryCallId: callId,
    });
  });

  it('a persisted PARTIAL is EXECUTE_NOT_COMPLETED (exit 1, rows kept); the same attempt is then refused in both modes', async () => {
    const runId = await completedRunWithPages(2);
    const partial = await act({ runId, execute: true }, [answer(new Set([0]))]);
    const e = envelopeOf(partial);
    expect(e).toMatchObject({
      code: 'EXECUTE_NOT_COMPLETED',
      outcome: 'NOT_COMPLETED',
      exitCode: 1,
      reason: null,
    });
    const batch = (e.data as { result: string; batches: Record<string, unknown>[] }).batches[0]!;
    expect((e.data as { result: string }).result).toBe('NOT_COMPLETED');
    expect(batch).toMatchObject({ kind: 'EXECUTED', terminalState: 'PARTIAL' });
    const callId = batch['callId'] as string;

    const before = await snapshot();
    const dry = await act({ runId });
    expect(envelopeOf(dry)).toMatchObject({
      code: 'DRY_RUN_EXECUTION_NOT_PERMITTED',
      reason: { blockedBy: ['ATTEMPT_ALREADY_EXISTS_NON_COMPLETED'] },
    });
    const exec = await act({ runId, execute: true }, [answer()]);
    expect(envelopeOf(exec)).toMatchObject({
      code: 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED',
      outcome: 'REFUSED',
      exitCode: 1,
      data: null,
      reason: {
        kind: 'ATTEMPT_ALREADY_EXISTS_NON_COMPLETED',
        attemptNo: 1,
        batches: [{ batchIndex: 0, persistedState: 'PARTIAL', existingCallId: callId }],
      },
    });
    expect(exec.providers).toBe(0);
    expect(await snapshot()).toEqual(before);

    // A deliberate higher attempt is the operator's choice, never automatic.
    const second = await act({ runId, execute: true, attempt: '2' }, [answer()]);
    expect(envelopeOf(second)).toMatchObject({ code: 'EXECUTE_COMPLETED' });
  });

  it('a persisted FAILED is EXECUTE_NOT_COMPLETED with the terminal state, never retried', async () => {
    const runId = await completedRunWithPages(1);
    const r = await act({ runId, execute: true }, [scriptedRefusal()]);
    const e = envelopeOf(r);
    expect(e).toMatchObject({ code: 'EXECUTE_NOT_COMPLETED', exitCode: 1 });
    expect((e.data as { batches: Record<string, unknown>[] }).batches[0]).toMatchObject({
      terminalState: 'FAILED',
    });
    expect(r.providers).toBe(1);
  });

  it('human mode is unchanged: the same PARTIAL prints the landed text and no JSON', async () => {
    const runId = await completedRunWithPages(1);
    const r = await act({ runId, execute: true, json: false }, [answer(new Set([0]))]);
    expect(r.exit).toBe(1);
    expect(r.stdout.startsWith('EXECUTE orgunits classify: organisation')).toBe(true);
    expect(r.stdout).toContain('At least one batch did not complete.');
    expect(r.stdout).not.toContain(CLASSIFIER_OPERATOR_CONTRACT_VERSION);
    expect(r.stdout).not.toMatch(/^\{/);
  });

  // -------------------------------------------------------------------------
  // READS - not found, and the real router.
  // -------------------------------------------------------------------------

  it('unknown organisation / call ids are NOT_FOUND envelopes with no data', async () => {
    for (const positionals of [['runs'], ['calls']]) {
      const r = await read({ positionals, organisationId: UNKNOWN_UUID });
      expect(envelopeOf(r)).toMatchObject({
        code: 'ORGANISATION_NOT_FOUND',
        outcome: 'NOT_FOUND',
        exitCode: 1,
        data: null,
        reason: { kind: 'ORGANISATION_NOT_FOUND', organisationId: UNKNOWN_UUID },
      });
    }
    const s = await read({ positionals: ['show'], callId: UNKNOWN_UUID });
    expect(envelopeOf(s)).toMatchObject({
      operation: 'CLASSIFY_SHOW',
      code: 'CALL_NOT_FOUND',
      reason: { kind: 'CALL_NOT_FOUND', callId: UNKNOWN_UUID },
    });
  });

  it('through the real router, reads are envelopes on process stdout and write nothing', async () => {
    const before = await snapshot();
    let stdout = '';
    const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdout += String(chunk);
      return true;
    });
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const exit = await main([
        'orgunits',
        'classify',
        'runs',
        '--organisation-id',
        root.organisationId,
        '--json',
      ]);
      expect(envelopeOf({ exit, stdout, stderr: '' })).toMatchObject({
        operation: 'CLASSIFY_RUNS',
        code: 'READ_SUCCEEDED',
      });
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
    expect(await snapshot()).toEqual(before);
  });
});

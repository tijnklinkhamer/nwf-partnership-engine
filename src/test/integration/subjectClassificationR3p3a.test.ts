/**
 * R3P3-A (ADR 0031, migration 0030) - SUBJECT-ROOTED CLASSIFICATION against
 * REAL PostgreSQL (`*_test` only), SYNTHETIC subjects, a SCRIPTED transport
 * and a SCRIPTED (fake) classifier provider. No request leaves the process
 * and no model is ever called.
 *
 *   1. migration 0030: a subject-rooted call is recordable ONLY for a real
 *      admission, only under that admission's own run, never with an ECHE
 *      key, an organisation or a split root key; ECHE calls are unchanged;
 *      `nwf_classifier` stays append-only and gains no subject-table read;
 *   2. `orgunits subjects classify`: dry run by default (no provider, no
 *      write), execute through the fake provider (one call row naming the
 *      admission, classifications for accepted documents only), COMPLETED
 *      reuse, and the refusals - unknown/revoked admission, another
 *      admission's run, an ECHE run, a disallowed model, unverifiable cohort
 *      metadata, a non-completed attempt collision.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  executeSubjectClassifyCommand,
  type SubjectClassifyDependencies,
  type SubjectClassifyOptions,
} from '../../cli/commands/subjectClassify.js';
import type { RegistryLoadResult } from '../../orgunits/classify/evaluationCohortGuard.js';
import { ORGUNIT_CLASSIFIER_ALLOWED_MODELS } from '../../orgunits/classify/provider/allowedModels.js';
import type {
  ClassifierProviderRequest,
  ClassifierProviderResult,
} from '../../orgunits/classify/providerContract.js';
import {
  ScriptedTestProvider,
  scriptedOk,
  type ScriptedResponder,
} from '../../orgunits/classify/scriptedProvider.js';
import { runSubjectDiscovery } from '../../orgunits/orchestrator/orchestrate.js';
import { startRun } from '../../orgunits/orchestrator/run.js';
import {
  ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION,
  subjectClassifierSystemPrompt,
} from '../../orgunits/subjectClassify/prompt.js';
import {
  ALLOW_ALL,
  ScriptedTransport,
  createRelSubjectHarness,
  html,
  instantClock,
  page,
  response,
} from '../helpers/relSubjectHarness.js';
import { syntheticCohort } from '../helpers/syntheticCohortRegistry.js';
import {
  adminPool,
  classifierDatabaseConfigured,
  classifierPool,
  readonlyPool,
  researchDatabaseConfigured,
  researchPool,
  truncateAll,
} from './helpers.js';

const describeDb =
  researchDatabaseConfigured() && classifierDatabaseConfigured() ? describe : describe.skip;

const SITE_A = 'https://www.synthetic-r3p3a-sprachcafe.example.de/';
const SITE_B = 'https://www.synthetic-r3p3a-cultura.example.es/';
const MODEL = ORGUNIT_CLASSIFIER_ALLOWED_MODELS[0]!;
const CLEAN_ENV: Readonly<Record<string, string>> = Object.freeze({ HOME: '/zz-home-r3p3a' });
const CLASSIFIER_TABLES = [
  'orgunit_classifier_calls',
  'orgunit_classifier_call_completions',
  'orgunit_page_classifications',
  'orgunit_classification_subjects',
];

/** Answers every document as a UNIT_PAGE whose title is its evidence. */
function answerAll(): ScriptedResponder {
  return (request: ClassifierProviderRequest): ClassifierProviderResult => {
    const batch = JSON.parse(request.serializedBatch) as {
      documents: { docIndex: number; title: string | null }[];
    };
    return scriptedOk({
      results: batch.documents.map((doc) => ({
        doc_index: doc.docIndex,
        verdict: 'UNIT_PAGE',
        unit_type: 'LANGUAGE_CENTRE',
        page_kind: null,
        unit_name: doc.title,
        serves_incoming_international_students: 'UNKNOWN',
        serves_outgoing_mobility_students: 'UNKNOWN',
        provides_language_learning_or_support: 'YES',
        confidence: 'HIGH',
        rationale: 'The title names the unit.',
        evidence_spans: [{ source: 'TITLE', quote: doc.title ?? '' }],
      })),
    });
  };
}

describeDb('R3P3-A: subject-rooted classification (migration 0030, ADR 0031)', () => {
  let admin: pg.Pool;
  let research: pg.Pool;
  let classifier: pg.Pool;
  let readonly: pg.Pool;
  const h = createRelSubjectHarness('r3p3a');
  const cohort = syntheticCohort();
  const loadCohortRegistry = (): RegistryLoadResult => cohort.load();
  let admissionA: string;
  let admissionB: string;
  let subjectA: string;
  let runA: string;
  let runB: string;

  async function subjectRun(site: string, admissionId: string): Promise<string> {
    const transport = new ScriptedTransport()
      .route(`${site}robots.txt`, response(200, ALLOW_ALL, 'text/plain'))
      .route(
        site,
        html(
          page('de', 'Sprachcafé Verein', 'Ein unabhängiger Verein für Sprachaustausch.', [
            ['/tandem/', 'Sprachtandem'],
          ]),
        ),
      )
      .route(`${site}tandem/`, html(page('de', 'Sprachtandem', 'Wöchentliches Sprachtandem.')));
    const run = await runSubjectDiscovery(
      research,
      { admissionId, networkVantage: 'test' },
      { transport, clock: instantClock(), loadCohortRegistry },
    );
    expect(run.runTerminalState).toBe('COMPLETED');
    return run.runId;
  }

  async function counts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const t of CLASSIFIER_TABLES) {
      out[t] = (await admin.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`)).rows[0]!.n;
    }
    return out;
  }

  beforeAll(async () => {
    admin = adminPool();
    research = researchPool();
    classifier = classifierPool();
    readonly = readonlyPool();
    await truncateAll(admin);
    await h.setUp(admin);
    const a = await h.confirmedSubject(readonly, 'Synthetic R3P3A Sprachcafe', SITE_A);
    const b = await h.confirmedSubject(readonly, 'Synthetic R3P3A Cultura', SITE_B);
    subjectA = a.subjectId;
    admissionA = await h.admit(admin, a.subjectId, a.websiteClaimId, loadCohortRegistry);
    admissionB = await h.admit(admin, b.subjectId, b.websiteClaimId, loadCohortRegistry);
    runA = await subjectRun(SITE_A, admissionA);
    runB = await subjectRun(SITE_B, admissionB);
  });

  afterAll(async () => {
    await truncateAll(admin);
    await h.tearDown(admin);
    await Promise.all([admin.end(), research.end(), classifier.end(), readonly.end()]);
  });

  // ---------------------------------------------------------------- migration 0030

  const insertCall = (
    pool: pg.Pool,
    fields: {
      runId: string;
      admissionId: string | null;
      echeRowKey?: string | null;
      organisationId?: string | null;
      rootKey?: string | null;
    },
  ) =>
    pool.query(
      `INSERT INTO orgunit_classifier_calls
         (run_id, eche_row_key, organisation_id, root_key, root_subject_admission_id, model_id,
          prompt_version, classifier_version, output_schema_version, input_sha256,
          input_document_count, requested_at)
       VALUES ($1, $2, $3, $4, $5, 'm', 'p', 'c', 's', $6, 1, now())`,
      [
        fields.runId,
        fields.echeRowKey ?? null,
        fields.organisationId ?? null,
        fields.rootKey ?? null,
        fields.admissionId,
        randomUUID().replace(/-/g, '').padEnd(64, '0'),
      ],
    );

  const refusal = async (fn: () => Promise<unknown>): Promise<string> => {
    try {
      await fn();
    } catch (error) {
      return (error as { constraint?: string; code?: string }).constraint ?? String(error);
    }
    return 'ACCEPTED';
  };

  it('0030: a subject-rooted call is recordable for a real admission, under its own run', async () => {
    await admin.query('BEGIN');
    try {
      await insertCall(admin, { runId: runA, admissionId: admissionA });
      const { rows } = await admin.query<{ run_root_scope: string; eche_row_key: string | null }>(
        `SELECT run_root_scope, eche_row_key FROM orgunit_classifier_calls
          WHERE root_subject_admission_id = $1`,
        [admissionA],
      );
      expect(rows).toEqual([
        { run_root_scope: `subject_admission:${admissionA}`, eche_row_key: null },
      ]);
    } finally {
      await admin.query('ROLLBACK');
    }
  });

  it('0030: refuses an unknown admission, another admission run, an ECHE run, and invented identity', async () => {
    const eche = await startRun(research, { networkVantage: 'test' });
    expect(await refusal(() => insertCall(admin, { runId: runA, admissionId: randomUUID() }))).toBe(
      'orgunit_classifier_calls_root_subject_admission_fk',
    );
    expect(await refusal(() => insertCall(admin, { runId: runB, admissionId: admissionA }))).toBe(
      'orgunit_classifier_calls_run_scope_fk',
    );
    expect(await refusal(() => insertCall(admin, { runId: eche, admissionId: admissionA }))).toBe(
      'orgunit_classifier_calls_run_scope_fk',
    );
    expect(
      await refusal(() =>
        insertCall(admin, { runId: runA, admissionId: admissionA, echeRowKey: 'T R3P3A|1' }),
      ),
    ).toBe('orgunit_classifier_calls_subject_root_chk');
    expect(
      await refusal(() =>
        insertCall(admin, {
          runId: runA,
          admissionId: admissionA,
          rootKey: `subject_admission:${admissionA}`,
        }),
      ),
    ).toMatch(/orgunit_classifier_calls_(root_key|subject_root)_chk/);
  });

  it('0030: ECHE calls are unchanged - an ECHE key is still required, and only on ECHE runs', async () => {
    const eche = await startRun(research, { networkVantage: 'test' });
    expect(await refusal(() => insertCall(admin, { runId: eche, admissionId: null }))).toBe(
      'orgunit_classifier_calls_subject_root_chk',
    );
    expect(
      await refusal(() =>
        insertCall(admin, { runId: runA, admissionId: null, echeRowKey: 'T R3P3A|2' }),
      ),
    ).toBe('orgunit_classifier_calls_run_scope_fk');
    expect(
      await refusal(() =>
        insertCall(admin, {
          runId: eche,
          admissionId: null,
          echeRowKey: 'T R3P3A|3',
          rootKey: `subject_admission:${admissionA}`,
        }),
      ),
    ).toBe('orgunit_classifier_calls_root_key_chk');
    await admin.query('BEGIN');
    try {
      await insertCall(admin, { runId: eche, admissionId: null, echeRowKey: 'T R3P3A|4' });
      const { rows } = await admin.query<{ run_root_scope: string }>(
        `SELECT run_root_scope FROM orgunit_classifier_calls WHERE eche_row_key = 'T R3P3A|4'`,
      );
      expect(rows).toEqual([{ run_root_scope: 'ECHE' }]);
    } finally {
      await admin.query('ROLLBACK');
    }
  });

  it('0030: nwf_classifier stays SELECT+INSERT only and reads no discovery-subject table', async () => {
    const { rows } = await admin.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = 'nwf_classifier' ORDER BY table_name, privilege_type`,
    );
    expect(rows.every((r) => r.privilege_type === 'SELECT' || r.privilege_type === 'INSERT')).toBe(
      true,
    );
    expect(rows.some((r) => /^(subject_|discovery_)/.test(r.table_name))).toBe(false);
    const writable = rows.filter((r) => r.privilege_type === 'INSERT').map((r) => r.table_name);
    expect(writable).toEqual([
      'orgunit_classification_subjects',
      'orgunit_classifier_call_completions',
      'orgunit_classifier_calls',
      'orgunit_page_classifications',
    ]);
    expect(
      await refusal(() => classifier.query('SELECT 1 FROM subject_research_admissions')),
    ).toMatch(/permission denied/);
    // ...yet the classifier role can record a subject call: the FK is checked as the owner.
    await classifier.query('BEGIN');
    try {
      await insertCall(classifier as pg.Pool, { runId: runA, admissionId: admissionA });
    } finally {
      await classifier.query('ROLLBACK');
    }
    expect(
      await refusal(() =>
        classifier.query('UPDATE orgunit_classifier_calls SET model_id = model_id'),
      ),
    ).toMatch(/permission denied/);
    expect(await refusal(() => classifier.query('DELETE FROM orgunit_classifier_calls'))).toMatch(
      /permission denied/,
    );
  });

  // ---------------------------------------------------------------- the command

  function harness(
    script: readonly ScriptedResponder[] = [],
    overrides: Partial<SubjectClassifyDependencies> = {},
  ) {
    let created = 0;
    let provider: ScriptedTestProvider | null = null;
    let out = '';
    const deps: SubjectClassifyDependencies = {
      withResearchPool: (fn) => fn(research),
      withClassifierPool: (fn) => fn(classifier),
      env: CLEAN_ENV,
      repoRoot: '/zz-repo-root-r3p3a',
      loadCohortRegistry,
      createProvider: () => {
        created += 1;
        provider = new ScriptedTestProvider(script);
        return Promise.resolve(provider);
      },
      stdout: (t) => {
        out += t;
      },
      stderr: (t) => {
        out += t;
      },
      ...overrides,
    };
    return { deps, created: () => created, provider: () => provider, out: () => out };
  }

  const opts = (o: Partial<SubjectClassifyOptions> = {}): SubjectClassifyOptions => ({
    admissionId: admissionA,
    runId: runA,
    model: MODEL,
    execute: false,
    json: true,
    ...o,
  });

  const envelope = (text: string) =>
    JSON.parse(text.split('\n').find((l) => l.startsWith('{'))!) as {
      contract: string;
      code: string;
      exitCode: number;
      data?: Record<string, unknown>;
      reason?: Record<string, unknown>;
    };

  it('dry run: verifies, proves the cohort rule, assembles and plans - no provider, no write', async () => {
    const before = await counts();
    const t = harness();
    const exit = await executeSubjectClassifyCommand(opts(), t.deps);
    const e = envelope(t.out());
    expect(e.contract).toBe('nwf-pe.subject-classifier-operator.v1');
    expect(e.code, JSON.stringify(e.reason)).toBe('DRY_RUN_EXECUTION_PERMITTED');
    expect(exit).toBe(0);
    expect(e.data).toMatchObject({
      admissionId: admissionA,
      subjectId: subjectA,
      promptVersion: ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION,
      classifierVersion: 'orgunit-subject-classifier-assembly-v1',
      cohort: 'ALLOWED_OUTSIDE_EVALUATION_FRAME',
      providerCalls: 0,
      classifierWrites: 0,
    });
    expect(t.created()).toBe(0);
    expect(await counts()).toEqual(before);
    expect(t.out()).not.toMatch(/Sprachtandem|Wöchentliches/);
  });

  it('execute: one call naming the admission, through the fake provider, then COMPLETED reuse', async () => {
    const t = harness([answerAll()]);
    const exit = await executeSubjectClassifyCommand(opts({ execute: true }), t.deps);
    expect(envelope(t.out()).code).toBe('EXECUTE_COMPLETED');
    expect(exit).toBe(0);
    expect(t.created()).toBe(1);
    const request = t.provider()!.requests[0]!;
    expect(request.systemPrompt).toBe(subjectClassifierSystemPrompt());
    expect(request.serializedBatch).not.toMatch(/echeRowKey|organisationId|countryCode/);
    const calls = await admin.query<{
      root_subject_admission_id: string;
      eche_row_key: string | null;
      organisation_id: string | null;
      prompt_version: string;
      terminal_state: string;
      classified: number;
    }>(
      `SELECT k.root_subject_admission_id, k.eche_row_key, k.organisation_id, k.prompt_version,
              m.terminal_state,
              (SELECT count(*) FROM orgunit_page_classifications v WHERE v.call_id = k.id)::int AS classified
         FROM orgunit_classifier_calls k
         JOIN orgunit_classifier_call_completions m ON m.call_id = k.id`,
    );
    expect(calls.rows).toEqual([
      {
        root_subject_admission_id: admissionA,
        eche_row_key: null,
        organisation_id: null,
        prompt_version: ORGUNIT_SUBJECT_CLASSIFIER_PROMPT_VERSION,
        terminal_state: 'COMPLETED',
        classified: 2,
      },
    ]);

    const again = harness();
    expect(await executeSubjectClassifyCommand(opts({ execute: true }), again.deps)).toBe(0);
    expect(envelope(again.out()).data).toMatchObject({ result: 'COMPLETED' });
    expect(again.created()).toBe(0);
  });

  it('refuses a non-completed collision at the requested attempt before any provider call', async () => {
    const t = harness([
      () => ({
        outcome: 'PROVIDER_TRANSIENT',
        rawOutput: null,
        responseModelId: null,
        inputTokens: null,
        outputTokens: null,
        outcomeDetail: 'scripted transient',
        outcomeReasonCode: null,
      }),
    ]);
    expect(await executeSubjectClassifyCommand(opts({ execute: true, attempt: '2' }), t.deps)).toBe(
      1,
    );
    expect(envelope(t.out()).code).toBe('EXECUTE_NOT_COMPLETED');
    const before = await counts();
    const retry = harness([answerAll()]);
    expect(
      await executeSubjectClassifyCommand(opts({ execute: true, attempt: '2' }), retry.deps),
    ).toBe(1);
    expect(envelope(retry.out()).code).toBe('ATTEMPT_ALREADY_EXISTS_NON_COMPLETED');
    expect(retry.created()).toBe(0);
    expect(await counts()).toEqual(before);
  });

  it('refuses: unknown admission, another admission run, an ECHE run - and writes nothing', async () => {
    const before = await counts();
    const eche = await startRun(research, { networkVantage: 'test' });
    for (const [o, refusalCode] of [
      [{ admissionId: randomUUID() }, 'ADMISSION_UNKNOWN'],
      [{ runId: runB }, 'RUN_NOT_THIS_ADMISSION'],
      [{ runId: eche }, 'RUN_NOT_THIS_ADMISSION'],
      [{ runId: randomUUID() }, 'RUN_UNKNOWN'],
    ] as const) {
      const t = harness();
      expect(await executeSubjectClassifyCommand(opts({ ...o, execute: true }), t.deps)).toBe(1);
      expect(envelope(t.out())).toMatchObject({
        code: 'AUTHORITY_REFUSED',
        reason: { refusal: refusalCode },
      });
      expect(t.created()).toBe(0);
    }
    expect(await counts()).toEqual(before);
  });

  it('refuses: a disallowed model, unverifiable cohort metadata, malformed arguments', async () => {
    const model = harness();
    expect(
      await executeSubjectClassifyCommand(opts({ model: 'not-an-allowed-model' }), model.deps),
    ).toBe(1);
    expect(envelope(model.out()).code).toBe('PREFLIGHT_REFUSED');

    const unverified = harness([], {
      loadCohortRegistry: () => cohort.loadTampered((_, bytes) => bytes.set('FRAME', null)),
    });
    expect(await executeSubjectClassifyCommand(opts(), unverified.deps)).toBe(1);
    expect(envelope(unverified.out()).code).toBe('COHORT_METADATA_UNVERIFIED');

    const bad = harness();
    expect(await executeSubjectClassifyCommand(opts({ admissionId: 'nope' }), bad.deps)).toBe(1);
    expect(envelope(bad.out())).toMatchObject({
      code: 'INVALID_ARGUMENT',
      reason: { argument: 'subject-admission-id', problem: 'MALFORMED' },
    });
  });

  it('refuses a revoked admission (the OWNER withdrew research authority)', async () => {
    await admin.query(
      `INSERT INTO subject_research_admission_revocations (admission_id, actor_key, reason)
       VALUES ($1, 'owner-cli', 'r3p3a synthetic revocation')`,
      [admissionB],
    );
    const t = harness();
    expect(
      await executeSubjectClassifyCommand(
        opts({ admissionId: admissionB, runId: runB, execute: true }),
        t.deps,
      ),
    ).toBe(1);
    expect(envelope(t.out())).toMatchObject({
      code: 'AUTHORITY_REFUSED',
      reason: { refusal: 'ADMISSION_REVOKED' },
    });
  });
});

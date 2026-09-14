/**
 * PHASE 2B-2D2C-R1 — the ONE bounded item-level repair round, end to end,
 * against REAL PostgreSQL through the actual `nwf_classifier` role
 * (ADR 0011, migration 0011). Mirrors `orgunitClassifyOrchestrate.test.ts`'s
 * seeding discipline; every provider is a `ScriptedTestProvider`, every
 * clock is a fake, and no live model call exists anywhere in this file.
 */
import { createHash } from 'node:crypto';
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
import {
  runOrganisationClassification,
  type ClassifierCallResult,
} from '../../orgunits/classify/orchestrate.js';
import { loadEffectiveClassifications, loadRepairCalls } from '../../orgunits/classify/persist.js';
import {
  ScriptedTestProvider,
  scriptedOk,
  scriptedTimeout,
} from '../../orgunits/classify/scriptedProvider.js';
import {
  REPAIR_HARD_KILL_GRACE_MS,
  REPAIR_POLICY_ONE_ROUND,
  REPAIR_REQUEST_VERSION,
  REPAIR_TOTAL_BUDGET_MS,
} from '../../orgunits/classify/repair.js';
import { createFakeClock } from '../../orgunits/orchestrator/clock.js';

const describeDb = classifierDatabaseConfigured() ? describe : describe.skip;

function sha(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

const OFFICE_TITLE = 'International Office';
const OFFICE_TEXT = 'The International Office supports incoming and outgoing students.';

function unitResult(docIndex: number, overrides: Record<string, unknown> = {}) {
  return {
    doc_index: docIndex,
    verdict: 'UNIT_PAGE',
    unit_type: 'INTERNATIONAL_MOBILITY_OFFICE',
    page_kind: null,
    unit_name: OFFICE_TITLE,
    serves_incoming_international_students: 'YES',
    serves_outgoing_mobility_students: 'YES',
    provides_language_learning_or_support: 'UNKNOWN',
    confidence: 'HIGH',
    rationale: 'Title names the office directly.',
    evidence_spans: [{ source: 'TITLE', quote: OFFICE_TITLE }],
    ...overrides,
  };
}

/** The observed attempt-1 shape: a literal quote attributed to the wrong field. */
const MIS_SOURCED = unitResult(0, {
  evidence_spans: [{ source: 'HEADING', quote: OFFICE_TITLE }],
});
/** The observed attempt-1 shape: a unit_name no field of the document supports. */
const EXPANDED_NAME = (docIndex: number) =>
  unitResult(docIndex, { unit_name: 'International Office and Global Engagement Directorate' });

describeDb('classifier orchestration - the one bounded repair round (integration)', () => {
  let admin: pg.Pool;
  let classifier: pg.Pool;
  let readonly: pg.Pool;
  let root: OrgunitRootFixture;

  beforeAll(async () => {
    admin = adminPool();
    classifier = classifierPool();
    readonly = readonlyPool();
  });

  afterAll(async () => {
    await Promise.all([admin.end(), classifier.end(), readonly.end()]);
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
    const host = new URL(url).hostname;
    const { rows } = await admin.query<{ root_key: string }>(
      `INSERT INTO orgunit_fetch_observations
         (run_id, root_website_claim_id, eche_row_key, requested_url,
          requested_host, requested_registrable_domain, discovery_method,
          http_status, robots_decision, fetch_policy_version, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ROOT',
               200, 'ALLOWED', 'orgunit-fetch-policy-v1', now())
       RETURNING root_key`,
      [runId, root.websiteClaimId, root.echeRowKey, url, host, host.split('.').slice(-2).join('.')],
    );
    return rows[0]!.root_key;
  }

  async function seedPage(opts: {
    runId: string;
    rootKey: string;
    url: string;
    seed: string;
    title: string;
    mainText: string;
    rank: number;
  }): Promise<string> {
    const hostname = new URL(opts.url).hostname;
    const claimId = opts.rootKey.slice('claim:'.length);
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
        sha(opts.seed),
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
       VALUES ($1, $2, $3, 'INTERNATIONAL_OFFICE', 9, '[]'::jsonb, $4, 'orgunit-signal-rules-v1')`,
      [page.rows[0]!.id, opts.runId, fetch.rows[0]!.root_key, opts.rank],
    );
    return page.rows[0]!.id;
  }

  /** Two documents: doc 0 is the office page, doc 1 a sibling office page. */
  async function twoDocumentRun(host: string): Promise<{ runId: string; pageIds: string[] }> {
    await freshRoot();
    const runId = await seedRun();
    const rootKey = await seedRootFetch(runId, `https://${host}/`);
    await completeRun(runId);
    const pageIds = [
      await seedPage({
        runId,
        rootKey,
        url: `https://${host}/international`,
        seed: `${host}-0`,
        title: OFFICE_TITLE,
        mainText: OFFICE_TEXT,
        rank: 1,
      }),
      await seedPage({
        runId,
        rootKey,
        url: `https://${host}/welcome`,
        seed: `${host}-1`,
        title: OFFICE_TITLE,
        mainText: OFFICE_TEXT,
        rank: 2,
      }),
    ];
    return { runId, pageIds };
  }

  function executed(result: ClassifierCallResult | undefined) {
    expect(result?.kind).toBe('EXECUTED');
    if (result?.kind !== 'EXECUTED') throw new Error('unreachable');
    return result;
  }

  it('ACCEPTED: a mis-sourced span is re-asked ALONE, validated by the unchanged validator, and persisted under a linked repair call; the original PARTIAL stands untouched', async () => {
    const { runId, pageIds } = await twoDocumentRun('www.repair-ok.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const clock = createFakeClock();
    const provider = new ScriptedTestProvider([
      // Original: doc 0 mis-sourced (rejected), doc 1 accepted.
      scriptedOk({ results: [MIS_SOURCED, unitResult(1)] }),
      // Repair: the same quote, correctly sourced.
      (request) => {
        clock.advance(20_000);
        expect(request.serializedBatch).not.toContain('/welcome'); // no sibling document
        expect(request.serializedBatch).toContain(`"version":"${REPAIR_REQUEST_VERSION}"`);
        return scriptedOk({ results: [unitResult(0)] }, { inputTokens: 700, outputTokens: 90 });
      },
    ]);

    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: 'test-model-repair',
      provider,
      repairPolicy: REPAIR_POLICY_ONE_ROUND,
      clock,
    });
    const call = executed(result);
    expect(call.terminalState).toBe('PARTIAL');
    expect(call.errorKind).toBe('EVIDENCE_SPAN_UNVERIFIED');
    expect(call.documents.find((d) => d.docIndex === 0)).toMatchObject({ rejected: true });
    expect(call.repairs).toHaveLength(1);
    expect(call.repairs[0]).toMatchObject({
      docIndex: 0,
      disposition: 'ACCEPTED',
      terminalState: 'COMPLETED',
      errorKind: null,
      reasonCodes: ['EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE'],
      verdict: 'UNIT_PAGE',
      inputTokens: 700,
      outputTokens: 90,
      elapsedMs: 20_000,
    });
    expect(provider.callCount).toBe(2);

    // The repair request: the frozen prompt and schema, one document, and a bounded window.
    const repairRequest = provider.requests[1]!;
    expect(repairRequest.systemPrompt).toBe(provider.requests[0]!.systemPrompt);
    expect(repairRequest.outputJsonSchema).toBe(provider.requests[0]!.outputJsonSchema);
    expect(repairRequest.totalBudgetMs).toBe(REPAIR_TOTAL_BUDGET_MS - REPAIR_HARD_KILL_GRACE_MS);
    const payload = JSON.parse(repairRequest.serializedBatch) as {
      documents: { doc_index?: number; docIndex: number }[];
      repair: { doc_index: number; reason_codes: string[]; invalid_fields: unknown[] };
    };
    expect(payload.documents).toHaveLength(1);
    expect(payload.documents[0]!.docIndex).toBe(0);
    expect(payload.repair.doc_index).toBe(0);
    expect(payload.repair.reason_codes).toEqual(['EVIDENCE_SPAN_VERIFIES_UNDER_OTHER_SOURCE']);

    // Durable state: two call rows (original + repair), two completions, two classifications.
    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(2);
    expect(await count(classifier, 'orgunit_classifier_call_completions')).toBe(2);
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(2);
    const repairs = await loadRepairCalls(classifier, call.callId);
    expect(repairs).toHaveLength(1);
    expect(repairs[0]).toMatchObject({
      repairDocIndex: 0,
      terminalState: 'COMPLETED',
      errorKind: null,
    });
    const repairRow = await classifier.query<{
      repair_of_call_id: string;
      repair_doc_index: number;
      input_document_count: number;
      attempt_no: number;
      input_sha256: string;
    }>(`SELECT repair_of_call_id, repair_doc_index, input_document_count, attempt_no, input_sha256
          FROM orgunit_classifier_calls WHERE repair_of_call_id IS NOT NULL`);
    expect(repairRow.rows[0]).toMatchObject({
      repair_of_call_id: call.callId,
      repair_doc_index: 0,
      input_document_count: 1,
      attempt_no: 1,
    });
    const original = await classifier.query<{ input_sha256: string; terminal_state: string }>(
      `SELECT c.input_sha256, comp.terminal_state FROM orgunit_classifier_calls c
         JOIN orgunit_classifier_call_completions comp ON comp.call_id = c.id WHERE c.id = $1`,
      [call.callId],
    );
    expect(original.rows[0]!.terminal_state).toBe('PARTIAL'); // never rewritten
    expect(repairRow.rows[0]!.input_sha256).not.toBe(original.rows[0]!.input_sha256);

    // The reader rule: the effective set is the original's row plus the repaired one, disjoint.
    const effective = await loadEffectiveClassifications(classifier, call.callId);
    expect(effective.map((row) => [row.pageEvidenceId, row.repaired]).sort()).toEqual(
      [
        [pageIds[0], true],
        [pageIds[1], false],
      ].sort(),
    );
  });

  it('REJECTED AGAIN: a repair that still fails validation is terminally rejected - FAILED / EVIDENCE_SPAN_UNVERIFIED, no row, no second repair', async () => {
    const { runId } = await twoDocumentRun('www.repair-fail.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const provider = new ScriptedTestProvider([
      scriptedOk({ results: [EXPANDED_NAME(0), unitResult(1)] }),
      scriptedOk({ results: [EXPANDED_NAME(0)] }), // expands again
    ]);
    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: 'test-model-repair-fail',
      provider,
      repairPolicy: REPAIR_POLICY_ONE_ROUND,
      clock: createFakeClock(),
    });
    const call = executed(result);
    expect(call.repairs[0]).toMatchObject({
      docIndex: 0,
      disposition: 'REJECTED',
      terminalState: 'FAILED',
      errorKind: 'EVIDENCE_SPAN_UNVERIFIED',
      reasonCodes: ['UNIT_NAME_UNSUPPORTED'],
      verdict: null,
    });
    expect(provider.callCount).toBe(2); // exactly one repair, never a repair of a repair
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(1); // only doc 1
    const repairs = await loadRepairCalls(classifier, call.callId);
    expect(repairs[0]).toMatchObject({
      terminalState: 'FAILED',
      errorKind: 'EVIDENCE_SPAN_UNVERIFIED',
    });
    expect(repairs[0]!.errorSummary).toContain('unit_name is not supported by any supplied field');
    expect(await loadEffectiveClassifications(classifier, call.callId)).toHaveLength(1);
  });

  it('TIMEOUT: a repair that times out is FAILED / TIMEOUT on its own row, the item stays rejected, and the round continues to the next document', async () => {
    const { runId } = await twoDocumentRun('www.repair-timeout.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const provider = new ScriptedTestProvider([
      scriptedOk({ results: [MIS_SOURCED, EXPANDED_NAME(1)] }), // both rejected
      scriptedTimeout('repair liveness deadline'), // doc 0's repair
      scriptedOk({ results: [unitResult(1)] }), // doc 1's repair succeeds
    ]);
    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: 'test-model-repair-timeout',
      provider,
      repairPolicy: REPAIR_POLICY_ONE_ROUND,
      clock: createFakeClock(),
    });
    const call = executed(result);
    expect(call.terminalState).toBe('FAILED'); // the original persisted nothing
    expect(call.repairs.map((r) => [r.docIndex, r.disposition, r.errorKind])).toEqual([
      [0, 'PROVIDER_FAILED', 'TIMEOUT'],
      [1, 'ACCEPTED', null],
    ]);
    expect(provider.callCount).toBe(3);
    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(3);
    expect(await count(classifier, 'orgunit_page_classifications')).toBe(1);
  });

  it('SKIPPED: too little of the original budget remains -> a repair row records the decision, FAILED / OTHER naming REPAIR_SKIPPED_INSUFFICIENT_BUDGET, zero provider calls', async () => {
    const { runId } = await twoDocumentRun('www.repair-skip.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const clock = createFakeClock();
    const provider = new ScriptedTestProvider([
      () => {
        clock.advance(560_000); // the original consumed 560 s of the 600 s budget
        return scriptedOk({ results: [MIS_SOURCED, unitResult(1)] });
      },
    ]);
    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: 'test-model-repair-skip',
      provider,
      repairPolicy: REPAIR_POLICY_ONE_ROUND,
      clock,
    });
    const call = executed(result);
    expect(call.repairs[0]).toMatchObject({
      docIndex: 0,
      disposition: 'SKIPPED',
      terminalState: 'FAILED',
      errorKind: 'OTHER',
    });
    expect(call.repairs[0]!.detail).toMatch(
      /^REPAIR_SKIPPED_INSUFFICIENT_BUDGET: 30000 ms usable of 40000 ms remaining/,
    );
    expect(provider.callCount).toBe(1);
    const repairs = await loadRepairCalls(classifier, call.callId);
    expect(repairs[0]!.errorSummary).toContain('REPAIR_SKIPPED_INSUFFICIENT_BUDGET');
  });

  it('DISABLED (the default): no repair is planned, no second provider call, no repair row - the pre-R1 lifecycle exactly', async () => {
    const { runId } = await twoDocumentRun('www.repair-off.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const provider = new ScriptedTestProvider([
      scriptedOk({ results: [MIS_SOURCED, unitResult(1)] }),
    ]);
    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: 'test-model-repair-off',
      provider,
    });
    const call = executed(result);
    expect(call.terminalState).toBe('PARTIAL');
    expect(call.repairs).toEqual([]);
    expect(provider.callCount).toBe(1);
    expect(await count(classifier, 'orgunit_classifier_calls')).toBe(1);
    expect(await loadRepairCalls(classifier, call.callId)).toEqual([]);
  });

  it('NEVER for a provider failure or a whole-call SCHEMA_INVALID, even with the policy on', async () => {
    const { runId } = await twoDocumentRun('www.repair-never.ac.uk');
    const runCompletion = await checkRunCompleted(readonly, runId);
    const provider = new ScriptedTestProvider([scriptedOk({ not: 'an envelope' })]);
    const [result] = await runOrganisationClassification(classifier, {
      organisationId: root.organisationId,
      runId,
      runCompletion,
      modelId: 'test-model-repair-never',
      provider,
      repairPolicy: REPAIR_POLICY_ONE_ROUND,
      clock: createFakeClock(),
    });
    const call = executed(result);
    expect(call.errorKind).toBe('SCHEMA_INVALID');
    expect(call.repairs).toEqual([]);
    expect(provider.callCount).toBe(1);
  });
});
